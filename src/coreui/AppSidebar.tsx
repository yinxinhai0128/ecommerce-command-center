import { CButton, CNav, CNavItem, CSidebar, CSidebarBrand } from '@coreui/react';
import type { ProductView } from './navigation';
import { navigation } from './navigation';

type AppSidebarProps = {
  activeView: ProductView;
  collapsed: boolean;
  onViewChange: (view: ProductView) => void;
};

export function AppSidebar({ activeView, collapsed, onViewChange }: AppSidebarProps) {
  return (
    <CSidebar className="coreui-shell-sidebar" visible={!collapsed}>
      <CSidebarBrand className="coreui-shell-brand">经营指挥中心</CSidebarBrand>
      <nav aria-label="主导航">
        <CNav className="coreui-shell-nav">
          {navigation.map(({ view, label }) => (
            <CNavItem key={view}>
              <CButton
                aria-current={activeView === view ? 'page' : undefined}
                className="coreui-shell-nav-button"
                color="link"
                onClick={() => onViewChange(view)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onViewChange(view);
                  }
                }}
                type="button"
              >
                {label}
              </CButton>
            </CNavItem>
          ))}
        </CNav>
      </nav>
    </CSidebar>
  );
}
