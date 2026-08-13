import { CContainer } from '@coreui/react';
import { useState, type ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';
import type { ProductView } from './navigation';

type AppShellProps = {
  activeView: ProductView;
  children: ReactNode;
  onViewChange: (view: ProductView) => void;
};

export function AppShell({ activeView, children, onViewChange }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? 'coreui-shell is-collapsed' : 'coreui-shell'}>
      <AppSidebar activeView={activeView} collapsed={collapsed} onViewChange={onViewChange} />
      <div className="coreui-shell-wrapper">
        <AppTopbar collapsed={collapsed} onCollapseChange={() => setCollapsed((value) => !value)} />
        <main className="coreui-shell-main">
          <CContainer fluid>{children}</CContainer>
        </main>
      </div>
    </div>
  );
}
