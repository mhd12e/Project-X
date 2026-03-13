import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'Project X';
const DEFAULT_DESCRIPTION = 'AI-powered business intelligence and operations platform. Autonomous agents that analyze documents, process knowledge, generate insights, and execute workflows.';

interface MetaProps {
  title?: string;
  description?: string;
  noSuffix?: boolean;
}

export function Meta({ title, description = DEFAULT_DESCRIPTION, noSuffix = false }: MetaProps) {
  const fullTitle = title
    ? noSuffix
      ? title
      : `${title} — ${SITE_NAME}`
    : SITE_NAME;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
