import { CButton, CContainer, CHeader } from '@coreui/react';

type AppTopbarProps = {
  collapsed: boolean;
  onCollapseChange: () => void;
};

export function AppTopbar({ collapsed, onCollapseChange }: AppTopbarProps) {
  return (
    <CHeader className="coreui-shell-topbar">
      <CContainer fluid className="coreui-shell-topbar-content">
        <CButton
          aria-label={collapsed ? '展开导航' : '收起导航'}
          className="coreui-shell-toggle"
          color="link"
          onClick={onCollapseChange}
          type="button"
        >
          {collapsed ? '展开导航' : '收起导航'}
        </CButton>
        <h1>经营指挥中心</h1>
      </CContainer>
    </CHeader>
  );
}
