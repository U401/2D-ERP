const fs = require('fs');

const filePath = 'app/(shell)/inventory/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add `useMemo` to the imports if not present
if (!content.includes('useMemo')) {
    content = content.replace(/import {([^}]+)} from 'react'/, (match, group1) => {
        return `import {${group1}, useMemo } from 'react'`;
    });
}

// 2. Add state variables inside the component
const stateVars = `
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const itemsPerPage = 20
`;

content = content.replace(
  /const \[searchQuery, setSearchQuery\] = useState\(''\)/,
  `const [searchQuery, setSearchQuery] = useState('')${stateVars}`
);

// 3. Add useMemo and useEffect for filtering logic before `return`
const logicBlock = `
  const uniqueCategories = useMemo(() => {
    const cats = new Set(allIngredients.map(ing => ing.category || 'Uncategorized'))
    return Array.from(cats).sort()
  }, [allIngredients])

  const uniqueStores = useMemo(() => {
    const s = new Set(allIngredients.map(ing => ing.store_name).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [allIngredients])

  const processedIngredients = useMemo(() => {
    let result = [...allIngredients]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(ing => 
        ing.name.toLowerCase().includes(q) || 
        ing.store_name?.toLowerCase().includes(q) ||
        (ing.category && ing.category.toLowerCase().includes(q))
      )
    }

    if (storeFilter !== 'all') {
      result = result.filter(ing => ing.store_name === storeFilter)
    }

    if (categoryFilter !== 'all') {
      result = result.filter(ing => (ing.category || 'Uncategorized') === categoryFilter)
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'out') {
        result = result.filter(ing => ing.current_stock === 0)
      } else if (statusFilter === 'low') {
        result = result.filter(ing => isLowStock(ing))
      }
    }

    if (sortConfig) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key as keyof typeof a]
        let bValue = b[sortConfig.key as keyof typeof b]

        if (sortConfig.key === 'unit_cost') {
          aValue = (a.purchase_price || 0) / (a.purchase_yield || 1) as any
          bValue = (b.purchase_price || 0) / (b.purchase_yield || 1) as any
        } else if (sortConfig.key === 'category') {
          aValue = (a.category || 'Uncategorized') as any
          bValue = (b.category || 'Uncategorized') as any
        } else if (sortConfig.key === 'name') {
           aValue = a.name.toLowerCase() as any
           bValue = b.name.toLowerCase() as any
        } else if (sortConfig.key === 'store_name') {
           aValue = (a.store_name || '').toLowerCase() as any
           bValue = (b.store_name || '').toLowerCase() as any
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [allIngredients, searchQuery, storeFilter, categoryFilter, statusFilter, sortConfig])

  const totalPages = Math.ceil(processedIngredients.length / itemsPerPage) || 1
  const paginatedIngredients = processedIngredients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, storeFilter, categoryFilter, statusFilter, sortConfig])

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) return <span className="material-symbols-outlined text-gray-300 text-sm align-middle ml-1">swap_vert</span>
    return <span className="material-symbols-outlined text-gray-900 text-sm align-middle ml-1">{sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
  }

  return (
`;

content = content.replace(/\n  return \(\s+<div/m, logicBlock + '\n    <div');

fs.writeFileSync(filePath, content, 'utf8');
