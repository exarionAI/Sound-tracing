import { Activity, Box, DoorOpen, Gauge } from 'lucide-react';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { CapabilityCheck } from './examples/capability/CapabilityCheck';
import { MultiroomDoor } from './examples/multiroom/MultiroomDoor';
import { ShoeboxRoom } from './examples/shoebox/ShoeboxRoom';

const navItems = [
  { to: '/examples/capability', label: 'Capability', icon: Gauge },
  { to: '/examples/shoebox', label: 'Shoebox', icon: Box },
  { to: '/examples/multiroom', label: 'Multiroom', icon: DoorOpen },
];

export function App(): JSX.Element {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="app-header">
          <NavLink className="brand-lockup" to="/examples/capability" aria-label="Sound-tracing.js demo home">
            <Activity aria-hidden="true" />
            <span>Sound-tracing.js</span>
          </NavLink>
          <nav className="app-nav" aria-label="Demo scenes">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className="nav-link">
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/examples/capability" replace />} />
            <Route path="/examples/capability" element={<CapabilityCheck />} />
            <Route path="/examples/shoebox" element={<ShoeboxRoom />} />
            <Route path="/examples/multiroom" element={<MultiroomDoor />} />
            <Route path="*" element={<Navigate to="/examples/capability" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
