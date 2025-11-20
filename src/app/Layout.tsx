// **`src/app/Layout.tsx`**

import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  
  const navItems = [
    { path: '/intro', label: '리그 소개' },
    { path: '/standings', label: '순위' },
    { path: '/prediction', label: '승부예측' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-2xl font-black tracking-tighter text-indigo-700">
            AUBL<span className="text-orange-500">.</span>
          </Link>
          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === item.path? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-gray-400 text-sm">
          &copy; 2025 Amateur University Baseball League. All rights reserved.
        </div>
      </footer>
    </div>
  );
}