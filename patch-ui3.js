const fs = require('fs');
let code = fs.readFileSync('app/(shell)/pos/page.tsx', 'utf8');

const startStr = '{/* Category Tabs */}';
const endStr = '{/* Right Panel - Cart or Order Details */}';

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `{/* Main Grid Area */}
          <div className="flex-1 flex flex-col min-h-0 relative p-4 overflow-y-auto bg-gray-50/50">
            {searchQuery ? (
               <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                 {filteredProducts.map((product) => (
                   <button
                     key={product.id}
                     onClick={() => addToCart(product)}
                     disabled={!sessionOpen}
                     title={!sessionOpen ? 'Open a session to start selling' : undefined}
                     className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 p-3 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white shadow-sm hover:shadow-lg"
                   >
                     {product.image_url ? (
                       <img
                         src={product.image_url}
                         alt={product.name}
                         className="w-full aspect-square object-cover rounded-xl"
                         onError={(e) => {
                           const target = e.target;
                           target.style.display = 'none';
                           target.nextElementSibling?.classList.remove('hidden');
                         }}
                       />
                     ) : null}
                     <div
                       className={\`w-full aspect-square bg-center bg-no-repeat bg-cover rounded-xl bg-gradient-to-br from-amber-800 to-amber-600 \${
                         product.image_url ? 'hidden' : ''
                       }\`}
                     ></div>
                     <div className="flex flex-col px-1">
                       <p className="text-gray-900 text-sm md:text-base font-bold leading-tight line-clamp-2">
                         {product.name}
                       </p>
                       <p className="text-emerald-700 text-sm md:text-base font-bold mt-0.5">
                         ₱{product.price.toFixed(2)}
                       </p>
                     </div>
                   </button>
                 ))}
               </div>
            ) : !selectedCategory ? (
               <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] content-start gap-4">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className="flex flex-col items-center justify-center gap-4 p-8 bg-white border border-gray-200 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-95 min-h-[160px]"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500">
                        <span className="material-symbols-outlined text-3xl">category</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900 text-center">{cat}</span>
                    </button>
                  ))}
               </div>
            ) : (
               <div className="flex flex-col gap-6">
                 <div className="flex items-center gap-4 pb-4 border-b border-gray-200 sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 pt-2 -mt-2">
                    <button 
                      onClick={() => setSelectedCategory('')}
                      className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all shadow-sm active:scale-95"
                    >
                       <span className="material-symbols-outlined text-2xl">arrow_back</span>
                    </button>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">{selectedCategory}</h2>
                 </div>
                 <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-4">
                   {filteredProducts.map((product) => (
                     <button
                       key={product.id}
                       onClick={() => addToCart(product)}
                       disabled={!sessionOpen}
                       title={!sessionOpen ? 'Open a session to start selling' : undefined}
                       className="flex flex-col gap-3 pb-4 cursor-pointer rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 p-3 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white shadow-sm hover:shadow-lg"
                     >
                       {product.image_url ? (
                         <img
                           src={product.image_url}
                           alt={product.name}
                           className="w-full aspect-square object-cover rounded-xl"
                           onError={(e) => {
                             const target = e.target;
                             target.style.display = 'none';
                             target.nextElementSibling?.classList.remove('hidden');
                           }}
                         />
                       ) : null}
                       <div
                         className={\`w-full aspect-square bg-center bg-no-repeat bg-cover rounded-xl bg-gradient-to-br from-amber-800 to-amber-600 \${
                           product.image_url ? 'hidden' : ''
                         }\`}
                       ></div>
                       <div className="flex flex-col px-1">
                         <p className="text-gray-900 text-sm md:text-base font-bold leading-tight line-clamp-2">
                           {product.name}
                         </p>
                         <p className="text-emerald-700 text-sm md:text-base font-bold mt-0.5">
                           ₱{product.price.toFixed(2)}
                         </p>
                       </div>
                     </button>
                   ))}
                 </div>
               </div>
            )}
          </div>
        </div>

        `;
  
  code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
  fs.writeFileSync('app/(shell)/pos/page.tsx', code, 'utf8');
} else {
  console.log('Not found');
}
