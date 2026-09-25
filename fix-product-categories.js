const fs = require('fs');
let code = fs.readFileSync('app/(shell)/menu/page.tsx', 'utf8');

// Replace Add/Edit Product category select with input+datalist
const selectRegex = /<select[\s\S]*?id="product-category(-new)?"[\s\S]*?value=\{formData\.category\}[\s\S]*?onChange=\{\(e\) => setFormData\(\{ \.\.\.formData, category: e\.target\.value \}\)\}[\s\S]*?>[\s\S]*?<option value="">Select category<\/option>[\s\S]*?\{categories\.map\(\(cat\) => \([\s\S]*?<option key=\{cat\} value=\{cat\}>[\s\S]*?\{cat\}[\s\S]*?<\/option>[\s\S]*?\)\)\}[\s\S]*?<\/select>/g;

const replacement = `<input
                      list="categories-list"
                      className="form-input w-full rounded-lg text-gray-900 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900 h-12 text-base px-3"
                      id="product-category$1"
                      placeholder="Type or select a category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                    <datalist id="categories-list">
                      {categories.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>`;

code = code.replace(selectRegex, replacement);

// Remove "Add New Category" form
const addCategoryFormRegex = /<div className="border-t border-gray-200 my-6"><\/div>\s*<h4 className="text-lg font-semibold text-gray-900 mb-4">Add New Category<\/h4>\s*<form onSubmit=\{handleAddCategory\} className="flex flex-col gap-5">[\s\S]*?<\/form>/;

code = code.replace(addCategoryFormRegex, '');

fs.writeFileSync('app/(shell)/menu/page.tsx', code, 'utf8');
