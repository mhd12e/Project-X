import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { BaseAgentService, type AgentConfig } from './base-agent.service';
import { ConversationGateway } from '../conversation.gateway';
import { ConversationService } from '../conversation.service';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { ActivityLogService } from '../../activity/activity-log.service';
import { ActivityCategory } from '../../activity/activity-log.entity';
import { AgentContextService } from '../../common/agent-context.service';
import { ContentIdeaService } from '../../content/content-idea.service';
import type { ContentBlock, ToolCallBlock, IdeaGeneratedBlock } from '../content-block.types';

const BRAINSTORM_SYSTEM_PROMPT = `You are a creative content strategist AI for Project X, a business intelligence platform.

# Your Role
You brainstorm content ideas for businesses. When asked, generate creative, actionable content ideas.

# Output Format
You MUST use the save_idea tool to save each idea you generate. For every idea:
1. Come up with a clear, compelling title
2. Write a detailed description (2-3 sentences) explaining the idea, its angle, and why it works
3. Assign a category from: social_media, blog_post, video, email, infographic, case_study, whitepaper, ad_copy, newsletter

# Guidelines
- Generate 5-8 diverse ideas per brainstorming session
- Each idea should be specific and actionable, not generic
- Consider the user's business context from the knowledge base
- Mix formats and channels for variety
- Use search_knowledge to understand the business before generating ideas
- Think about trends, seasonality, and audience engagement
- After saving all ideas, write a brief summary of the themes covered

# Managing Ideas
You can also update or delete existing ideas when the user asks:
- Use update_idea to change the title, description, or category of an existing idea
- Use delete_idea to remove ideas the user doesn't want
- When asked to "remove the last N ideas", find those ideas and delete them one by one
- Always confirm deletions/updates in your response`;

@Injectable()
export class ContentAgentService extends BaseAgentService {
  protected readonly logger = new Logger(ContentAgentService.name);
  protected get activityCategory(): ActivityCategory { return ActivityCategory.CONTENT; }

  constructor(
    conversationService: ConversationService,
    configService: ConfigService,
    gateway: ConversationGateway,
    activityLog: ActivityLogService,
    agentContext: AgentContextService,
    private readonly retrievalService: RetrievalService,
    private readonly ideaService: ContentIdeaService,
  ) {
    super(conversationService, configService, gateway, activityLog, agentContext);
  }

  protected async getAgentConfig(conversationId: string, blocks: ContentBlock[]): Promise<AgentConfig> {
    return {
      systemPrompt: BRAINSTORM_SYSTEM_PROMPT,
      mcpServers: { content: this.createMcpServer(conversationId, blocks) },
      builtinTools: ['WebSearch', 'WebFetch'],
      maxTurns: 30,
      cwd: '/app',
    };
  }

  protected async onComplete(conversationId: string, fullText: string): Promise<void> {
    const conversation = await this.conversationService.findById(conversationId);
    if (!conversation) return;

    const msgCount = await this.conversationService.getMessageCount(conversationId);
    if (msgCount === 2 && !conversation.title) {
      const userMsg = conversation.messages.find((m) => m.role === 'user');
      if (userMsg) {
        this.generateTitle(conversationId, userMsg.plainText, fullText).catch((err) => {
          this.logger.warn(`Title generation failed: ${err}`);
        });
      }
    }
  }

  private createMcpServer(conversationId: string, blocksRef: ContentBlock[]) {
    const ideaService = this.ideaService;
    const retrievalService = this.retrievalService;
    const emitFn = this.emit.bind(this);

    const emitToolResult = (toolName: string, resultText: string) => {
      emitFn(conversationId, 'tool_result', { toolName, toolResult: resultText });
      for (let i = blocksRef.length - 1; i >= 0; i--) {
        const b = blocksRef[i];
        if (b.type === 'tool_call' && b.toolName === toolName && !b.toolResult) {
          (b as ToolCallBlock).toolResult = resultText;
          break;
        }
      }
    };

    const saveIdea = tool(
      'save_idea',
      'Save a generated content idea. Call this for each idea you generate.',
      {
        title: z.string().describe('A clear, compelling title (max 200 chars).'),
        description: z.string().describe('Detailed description (2-3 sentences).'),
        category: z.enum([
          'social_media', 'blog_post', 'video', 'email',
          'infographic', 'case_study', 'whitepaper', 'ad_copy', 'newsletter',
        ]).describe('The content category.'),
      },
      async (args) => {
        const idea = await ideaService.create(conversationId, args.title, args.description, args.category);

        const ideaBlock: IdeaGeneratedBlock = {
          type: 'idea_generated',
          ideaId: idea.id,
          title: idea.title,
          description: idea.description,
          category: idea.category ?? undefined,
        };
        blocksRef.push(ideaBlock);

        emitFn(conversationId, 'idea_generated', {
          idea: { id: idea.id, title: idea.title, description: idea.description, category: idea.category ?? undefined },
        });
        emitToolResult('save_idea', `Idea saved: "${args.title}"`);

        return { content: [{ type: 'text' as const, text: `Idea "${args.title}" saved (ID: ${idea.id})` }] };
      },
    );

    const searchKnowledge = tool(
      'search_knowledge',
      'Search the knowledge base for business context.',
      {
        query: z.string().describe('The search query.'),
        limit: z.number().optional().describe('Max results (default 5).'),
      },
      async (args) => {
        const results = await retrievalService.search(args.query, { limit: args.limit ?? 5, scoreThreshold: 0.25 });
        if (results.length === 0) {
          emitToolResult('search_knowledge', 'No relevant knowledge found.');
          return { content: [{ type: 'text' as const, text: 'No relevant knowledge found.' }] };
        }
        const formatted = results.map((r, i) => `[${i + 1}] ${r.payload.source_file} | ${r.payload.section_name}\n${r.payload.chunk_text}`).join('\n\n---\n\n');
        emitToolResult('search_knowledge', `Found ${results.length} results.`);
        return { content: [{ type: 'text' as const, text: `Found ${results.length} results:\n\n${formatted}` }] };
      },
    );

    const deleteIdea = tool(
      'delete_idea',
      'Delete/remove a content idea by its ID. Use when the user asks to remove ideas.',
      {
        idea_id: z.string().describe('The UUID of the idea to delete.'),
      },
      async (args) => {
        const deleted = await ideaService.delete(args.idea_id);
        if (!deleted) {
          emitToolResult('delete_idea', 'Idea not found.');
          return { content: [{ type: 'text' as const, text: `Idea ${args.idea_id} not found.` }] };
        }
        emitToolResult('delete_idea', 'Idea deleted.');
        return { content: [{ type: 'text' as const, text: `Idea ${args.idea_id} deleted successfully.` }] };
      },
    );

    const updateIdea = tool(
      'update_idea',
      'Update an existing content idea (title, description, or category).',
      {
        idea_id: z.string().describe('The UUID of the idea to update.'),
        title: z.string().optional().describe('New title.'),
        description: z.string().optional().describe('New description.'),
        category: z.enum([
          'social_media', 'blog_post', 'video', 'email',
          'infographic', 'case_study', 'whitepaper', 'ad_copy', 'newsletter',
        ]).optional().describe('New category.'),
      },
      async (args) => {
        const updated = await ideaService.update(args.idea_id, {
          title: args.title,
          description: args.description,
          category: args.category,
        });
        if (!updated) {
          emitToolResult('update_idea', 'Idea not found.');
          return { content: [{ type: 'text' as const, text: `Idea ${args.idea_id} not found.` }] };
        }
        emitToolResult('update_idea', `Idea updated: "${updated.title}"`);
        return { content: [{ type: 'text' as const, text: `Idea "${updated.title}" updated successfully.` }] };
      },
    );

    const listIdeas = tool(
      'list_ideas',
      'List all ideas saved in the current conversation. Use this to find idea IDs before updating or deleting.',
      {},
      async () => {
        const ideas = await ideaService.findByConversation(conversationId);
        if (ideas.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No ideas saved in this conversation.' }] };
        }
        const list = ideas.map((idea, i) =>
          `${i + 1}. [${idea.id}] "${idea.title}" (${idea.category ?? 'uncategorized'})`,
        ).join('\n');
        return { content: [{ type: 'text' as const, text: `${ideas.length} ideas:\n${list}` }] };
      },
    );

    return createSdkMcpServer({ name: 'content-tools', tools: [saveIdea, searchKnowledge, deleteIdea, updateIdea, listIdeas] });
  }
}
