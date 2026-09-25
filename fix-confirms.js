const fs = require('fs');

function addImport(code, file) {
  if (code.includes("showConfirm")) return code; // already has it
  const firstImport = code.indexOf("import ");
  const lastImport = code.lastIndexOf("import ");
  const endOfLastImport = code.indexOf("\n", lastImport);
  return code.slice(0, endOfLastImport + 1) + "import { showConfirm } from '@/components/GlobalConfirm'\n" + code.slice(endOfLastImport + 1);
}

// Files and their specific confirm() replacements (old -> new)
const replacements = {
  "app/(shell)/menu/page.tsx": [
    ["if (!confirm('Are you sure you want to delete this product?')) return", "if (!(await showConfirm('Are you sure you want to delete this product?'))) return"],
    ["if (confirm('Are you sure you want to delete this product?')) {", "if (await showConfirm('Are you sure you want to delete this product?')) {"],
    [`if (!confirm(\`Are you sure you want to delete the category "\${categoryName}"?\`)) return`, `if (!(await showConfirm(\`Are you sure you want to delete the category "\${categoryName}"?\`))) return`],
  ],
  "app/(shell)/purchasing/page.tsx": [
    ["if (!confirm('Are you sure you want to cancel this purchase order?')) return", "if (!(await showConfirm('Are you sure you want to cancel this purchase order?'))) return"],
    [`if (!confirm(\`Delete supplier "\${s.name}"?\`)) return`, `if (!(await showConfirm(\`Delete supplier "\${s.name}"?\`))) return`],
  ],
  "app/(shell)/payroll/page.tsx": [
    ["if (!confirm('Are you sure you want to delete this payslip?')) return;", "if (!(await showConfirm('Are you sure you want to delete this payslip?'))) return;"],
  ],
  "app/(shell)/admin/AdminMenuManagement.tsx": [
    [`if (!confirm(\`Delete "\${product.name}"? This cannot be undone.\`)) return`, `if (!(await showConfirm(\`Delete "\${product.name}"? This cannot be undone.\`))) return`],
  ],
  "app/(shell)/admin/HRManagement.tsx": [
    [`if (!confirm(\`Clear \${DAY_NAMES[dayOfWeek]} \${slot.toUpperCase()} shift?\`)) return`, `if (!(await showConfirm(\`Clear \${DAY_NAMES[dayOfWeek]} \${slot.toUpperCase()} shift?\`))) return`],
    ["if (!confirm('Delete this override?')) return", "if (!(await showConfirm('Delete this override?'))) return"],
  ],
  "app/(shell)/admin/UserManagement.tsx": [
    [`if (!confirm(\`Delete user "\${username}"?\\n\\nThis will remove the user from Auth and the ERP. This cannot be undone.\`)) {`, `if (!(await showConfirm(\`Delete user "\${username}"?\\n\\nThis will remove the user from Auth and the ERP. This cannot be undone.\`))) {`],
  ],
  "app/(shell)/admin/StoreManagement.tsx": [
    [`if (confirm(\`Unassign \${user.username} from \${selectedStore.name}?\`)) {`, `if (await showConfirm(\`Unassign \${user.username} from \${selectedStore.name}?\`)) {`],
  ],
  "components/modals/AddIngredientModal.tsx": [
    ["if (!confirm('Are you sure you want to delete this supplier? This action cannot be undone.')) return", "if (!(await showConfirm('Are you sure you want to delete this supplier? This action cannot be undone.'))) return"],
    [`if (!confirm(\`Are you sure you want to rename "\${formData.category}" to "\${editCategoryName.trim()}" globally?\`)) return`, `if (!(await showConfirm(\`Are you sure you want to rename "\${formData.category}" to "\${editCategoryName.trim()}" globally?\`))) return`],
  ],
  "components/modals/EditIngredientModal.tsx": [
    ["if (confirm('Are you sure you want to delete this ingredient? This action cannot be undone.')) {", "if (await showConfirm('Are you sure you want to delete this ingredient? This action cannot be undone.')) {"],
  ],
};

let totalReplaced = 0;
for (const [file, pairs] of Object.entries(replacements)) {
  if (!fs.existsSync(file)) { console.log(`SKIP (not found): ${file}`); continue; }
  let code = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [oldStr, newStr] of pairs) {
    if (code.includes(oldStr)) {
      code = code.replace(oldStr, newStr);
      changed = true;
      totalReplaced++;
      console.log(`  REPLACED in ${file}`);
    } else {
      console.log(`  WARN: not found in ${file}: ${oldStr.slice(0, 60)}...`);
    }
  }
  if (changed) {
    code = addImport(code, file);
    fs.writeFileSync(file, code, 'utf8');
  }
}
console.log(`\nDone. ${totalReplaced} replacements made.`);
