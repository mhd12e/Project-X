import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Key, Plus, Trash2, CheckCircle2, Loader2,
  Eye, EyeOff, Shield, FlaskConical,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchCredentials,
  fetchSchemas,
  upsertCredential,
  deleteCredential,
  testCredential,
  type CredentialTypeSchema,
} from '@/store/vault.slice';

function CredentialCard({
  schema,
  credential,
  testing,
  onConfigure,
  onTest,
  onDelete,
}: {
  schema: CredentialTypeSchema;
  credential?: { maskedData: Record<string, string>; verified: boolean; label: string | null; updatedAt: string };
  testing: boolean;
  onConfigure: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const configured = !!credential;
  const firstSecretField = schema.fields.find((f) => f.type === 'secret');
  const maskedValue = credential?.maskedData[firstSecretField?.key ?? ''] ?? '';

  return (
    <div className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:border-primary/20">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Key className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{schema.displayName}</p>
          {configured && credential.verified && (
            <Badge variant="secondary" className="gap-1 text-[10px] text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Verified
            </Badge>
          )}
          {configured && !credential.verified && (
            <Badge variant="secondary" className="text-[10px] text-muted-foreground">
              Not tested
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{schema.description}</p>

        {configured && (
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
              {maskedValue}
            </code>
            {credential.label && (
              <span className="text-[10px] text-muted-foreground">({credential.label})</span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant={configured ? 'outline' : 'default'} className="text-xs gap-1.5" onClick={onConfigure}>
            {configured ? 'Update' : <><Plus className="h-3 w-3" /> Configure</>}
          </Button>
          {configured && (
            <>
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={onTest} disabled={testing}>
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                Test
              </Button>
              <Button size="sm" variant="outline" className="text-xs gap-1.5 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigureDialog({
  schema,
  open,
  onClose,
  onSave,
}: {
  schema: CredentialTypeSchema | null;
  open: boolean;
  onClose: () => void;
  onSave: (type: string, data: Record<string, string>, label?: string) => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData({});
      setLabel('');
      setShowSecrets({});
      setSaving(false);
    }
  }, [open]);

  if (!schema) return null;

  const canSave = schema.fields
    .filter((f) => f.required)
    .every((f) => formData[f.key]?.trim());

  const handleSave = async () => {
    setSaving(true);
    try {
      onSave(schema.type, formData, label || undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            {schema.displayName}
          </DialogTitle>
          <DialogDescription>{schema.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {schema.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`vault-${field.key}`} className="text-sm">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <div className="relative">
                <Input
                  id={`vault-${field.key}`}
                  type={field.type === 'secret' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={formData[field.key] ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="pr-10 font-mono text-sm"
                />
                {field.type === 'secret' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                    tabIndex={-1}
                  >
                    {showSecrets[field.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
              {field.helpText && (
                <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="vault-label" className="text-sm">Label (optional)</Label>
            <Input
              id="vault-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My personal key"
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CredentialVault() {
  const dispatch = useAppDispatch();
  const { credentials, schemas, testing } = useAppSelector((s) => s.vault);
  const [configuring, setConfiguring] = useState<CredentialTypeSchema | null>(null);

  useEffect(() => {
    dispatch(fetchCredentials());
    dispatch(fetchSchemas());
  }, [dispatch]);

  const handleSave = useCallback(async (type: string, data: Record<string, string>, label?: string) => {
    try {
      await dispatch(upsertCredential({ type, data, label })).unwrap();
      setConfiguring(null);
      toast.success('Credential saved');
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error.message ?? 'Failed to save credential');
    }
  }, [dispatch]);

  const handleTest = useCallback(async (type: string) => {
    try {
      const result = await dispatch(testCredential(type)).unwrap();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Test failed');
    }
  }, [dispatch]);

  const handleDelete = useCallback(async (type: string) => {
    await dispatch(deleteCredential(type));
    toast.success('Credential deleted');
  }, [dispatch]);

  const schemaList = Object.values(schemas);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Credential Vault
        </CardTitle>
        <CardDescription>
          Manage API keys for external services. Credentials are encrypted at rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {schemaList.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          schemaList.map((schema) => {
            const cred = credentials.find((c) => c.type === schema.type);
            return (
              <CredentialCard
                key={schema.type}
                schema={schema}
                credential={cred}
                testing={testing === schema.type}
                onConfigure={() => setConfiguring(schema)}
                onTest={() => handleTest(schema.type)}
                onDelete={() => handleDelete(schema.type)}
              />
            );
          })
        )}

        <ConfigureDialog
          schema={configuring}
          open={!!configuring}
          onClose={() => setConfiguring(null)}
          onSave={handleSave}
        />
      </CardContent>
    </Card>
  );
}
