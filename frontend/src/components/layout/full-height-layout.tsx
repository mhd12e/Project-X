/** Layout wrapper that fills the full height of the dashboard content area. */
export function FullHeightLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex -m-6 ${className ?? ''}`} style={{ height: 'calc(100% + 3rem)' }}>
      {children}
    </div>
  );
}
