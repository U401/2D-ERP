const fs = require('fs');
let code = fs.readFileSync('components/Sidebar.tsx', 'utf8');

// We need to pass isCollapsed down via a Context or just put everything in one component?
// NavCategory and NavLink are defined inside the file, but NavCategory is outside the Sidebar function.
// Let's move NavCategory into the Sidebar component so it can access isCollapsed, OR pass isCollapsed as a prop.

// Since NavCategory is outside, let's pass `isCollapsed` as a prop.
code = code.replace(
  /function NavCategory\(\{ label, icon, children, defaultOpen = false \}: \{ label: string, icon: string, children: React\.ReactNode, defaultOpen\?: boolean \}\) \{/,
  `function NavCategory({ label, icon, children, defaultOpen = false, isCollapsed = false }: { label: string, icon: string, children: React.ReactNode, defaultOpen?: boolean, isCollapsed?: boolean }) {`
);

code = code.replace(
  /return \(\s*<div className="flex flex-col mb-3">/,
  `return (
        <div className={\`flex flex-col \${isCollapsed ? 'mb-1' : 'mb-3'}\`}>`
);

code = code.replace(
  /<button\s*onClick=\{\(\) => setIsOpen\(\!isOpen\)\}/,
  `{!isCollapsed && (
            <button 
                onClick={() => setIsOpen(!isOpen)}`
);

code = code.replace(
  /<\/button>\s*<div className=\{\`grid transition-all duration-300 ease-in-out \$\{isOpen \? 'grid-rows-\[1fr\] opacity-100 mt-2' : 'grid-rows-\[0fr\] opacity-0'\}\`\}>/,
  `</button>
            )}
            <div className={isCollapsed ? 'block' : \`grid transition-all duration-300 ease-in-out \${isOpen ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}\`}>`
);

code = code.replace(
  /<div className="flex flex-col gap-2 pl-3 ml-6 border-l-2 border-slate-100">/,
  `<div className={\`flex flex-col gap-2 \${isCollapsed ? '' : 'pl-3 ml-6 border-l-2 border-slate-100'}\`}>`
);

// Now for Sidebar function
code = code.replace(
  /const \[storeName, setStoreName\] = useState<string>\(''\)/,
  `const [storeName, setStoreName] = useState<string>('')
    const [isCollapsed, setIsCollapsed] = useState(false)`
);

// Replace NavLink component
code = code.replace(
  /const NavLink = \(\{ href, icon, label, active \}: \{ href: string, icon: string, label: string, active: boolean \}\) => \(/,
  `const NavLink = ({ href, icon, label, active }: { href: string, icon: string, label: string, active: boolean }) => (`
);

code = code.replace(
  /<Link\s*href=\{href\}\s*onClick=\{\(\) => onNavigate\?\.\(\)\}\s*className=\{\`flex items-center gap-4 px-3 py-3 rounded-lg transition-colors \$\{\s*active \? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-gray-50'\s*\}\`\}/,
  `<Link
            href={href}
            title={isCollapsed ? label : undefined}
            onClick={() => onNavigate?.()}
            className={\`flex items-center gap-4 py-3 rounded-lg transition-colors \${isCollapsed ? 'justify-center px-0' : 'px-3'} \${
                active ? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-gray-50'
            }\`}`
);

code = code.replace(
  /<p className="text-gray-900 text-lg font-semibold leading-relaxed">\{label\}<\/p>/,
  `{!isCollapsed && <p className="text-gray-900 text-lg font-semibold leading-relaxed">{label}</p>}`
);

// Update aside classes
code = code.replace(
  /<aside className=\{\`flex-shrink-0 bg-white border-r border-gray-200 p-6 flex flex-col h-full w-\[280px\] lg:w-\[320px\] xl:w-\[360px\] max-w-full \$\{className\}\`\}>/,
  `<aside className={\`flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ease-in-out \${isCollapsed ? 'w-[88px] p-4' : 'p-6 w-[280px] lg:w-[320px] xl:w-[360px]'} max-w-full \${className}\`}>`
);

// Update user profile
code = code.replace(
  /<div className="flex items-center gap-4 mb-4">/,
  `<div className={\`flex items-center gap-4 mb-4 \${isCollapsed ? 'justify-center' : ''}\`}>`
);

code = code.replace(
  /<div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-14 bg-gradient-to-br from-green-400 to-green-600"><\/div>/,
  `<div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-14 bg-gradient-to-br from-green-400 to-green-600 shrink-0"></div>`
);

code = code.replace(
  /<div className="flex flex-col">\s*<h1 className="text-gray-900 text-lg font-semibold leading-relaxed">/,
  `{!isCollapsed && (
                        <div className="flex flex-col">
                        <h1 className="text-gray-900 text-lg font-semibold leading-relaxed truncate">`
);

code = code.replace(
  /\{isAdmin \? 'Admin' : 'Staff'\}\s*<\/p>\s*<\/div>\s*<\/div>/,
  `{isAdmin ? 'Admin' : 'Staff'}
                        </p>
                    </div>
                    )}
                </div>`
);


// Update all NavCategory usages to pass isCollapsed
code = code.replace(/<NavCategory/g, '<NavCategory isCollapsed={isCollapsed}');

// Update Logout button
code = code.replace(
  /<button\s*onClick=\{handleLogout\}\s*className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors hover:bg-red-50 text-red-600 w-full"/,
  `<button
                        onClick={handleLogout}
                        title={isCollapsed ? "Logout" : undefined}
                        className={\`flex items-center gap-3 py-3 rounded-lg transition-colors hover:bg-red-50 text-red-600 w-full \${isCollapsed ? 'justify-center px-0' : 'px-3'}\`}`
);

code = code.replace(
  /<p className="text-lg font-semibold leading-relaxed">\s*Logout\s*<\/p>/,
  `{!isCollapsed && (
                            <p className="text-lg font-semibold leading-relaxed">
                                Logout
                            </p>
                        )}`
);

// Add toggle collapse button at the very bottom
code = code.replace(
  /<\/button>\s*<\/div>\s*<\/div>\s*<\/aside>/,
  `</button>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={\`flex items-center gap-3 py-3 mt-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500 w-full \${isCollapsed ? 'justify-center px-0' : 'px-3'}\`}
                        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                            {isCollapsed ? 'chevron_right' : 'chevron_left'}
                        </span>
                        {!isCollapsed && (
                            <p className="text-lg font-semibold leading-relaxed">
                                Collapse
                            </p>
                        )}
                    </button>
                </div>
            </div>
        </aside>`
);

fs.writeFileSync('components/Sidebar.tsx', code, 'utf8');
