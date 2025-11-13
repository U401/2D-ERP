'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addProduct, updateProduct, deleteProduct } from '@/app/actions/products'
import { getProductRecipes, syncProductRecipes } from '@/app/actions/recipes'
import { getAllCategories, renameCategory, deleteCategory } from '@/app/actions/categories'

type Product = {
  id: string
  name: string
  price: number
  category: string | null
  image_url: string | null
}

type Ingredient = {
  id: string
  name: string
  unit: string
}

type RecipeItem = {
  id?: string
  ingredient_id: string
  ingredient_name?: string
  quantity: number
  unit?: string
}

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const [selectedIngredient, setSelectedIngredient] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    image_url: '',
  })
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    loadProducts()
    loadIngredients()
    loadCategories()
  }, [])

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name,
        category: editingProduct.category || '',
        price: editingProduct.price.toString(),
        image_url: editingProduct.image_url || '',
      })
      setImagePreview(editingProduct.image_url || null)
      setSelectedImage(null) // Reset selected image when switching products
      loadProductRecipes()
    } else {
      setFormData({
        name: '',
        category: '',
        price: '',
        image_url: '',
      })
      setImagePreview(null)
      setSelectedImage(null)
      setRecipeItems([])
    }
  }, [editingProduct])

  async function loadProducts() {
    const supabase = createClient()
    const { data } = await supabase.from('products').select('*').order('name')
    if (data) setProducts(data)
  }

  async function loadIngredients() {
    const supabase = createClient()
    const { data } = await supabase.from('ingredients').select('id, name, unit').order('name')
    if (data) setIngredients(data)
  }

  async function loadCategories() {
    const result = await getAllCategories()
    if (result.success) {
      setCategories(result.categories)
    }
  }

  async function loadProductRecipes() {
    if (!editingProduct) return

    const result = await getProductRecipes(editingProduct.id)
    if (result.success && result.recipes) {
      setRecipeItems(
        result.recipes.map((r: any) => ({
          id: r.id,
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredients?.name,
          quantity: r.quantity,
          unit: r.ingredients?.unit,
        }))
      )
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsProcessing(true)

    try {
      let imageUrl = formData.image_url || null

      // Upload image if a new file is selected
      if (selectedImage) {
        try {
          const supabase = createClient()
          
          // Generate unique filename
          const fileExt = selectedImage.name.split('.').pop()
          const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
          const filePath = `products/${fileName}`

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, selectedImage, {
              contentType: selectedImage.type,
              upsert: false,
            })

          if (uploadError) {
            if (uploadError.message.includes('Bucket not found')) {
              alert(
                'Storage bucket not found. Please create the "product-images" bucket in Supabase Storage. Visit /setup-storage for help.'
              )
            } else {
              alert(`Image upload failed: ${uploadError.message}`)
            }
            setIsProcessing(false)
            return
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath)

          imageUrl = urlData.publicUrl
        } catch (error) {
          alert(`Image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          setIsProcessing(false)
          return
        }
      } else if (editingProduct && editingProduct.id) {
        // When editing, if no new image selected, keep the existing image_url
        imageUrl = editingProduct.image_url || null
      }

      const productData = {
        name: formData.name,
        category: formData.category || null,
        price: parseFloat(formData.price),
        image_url: imageUrl,
      }

      let productId: string
      if (editingProduct && editingProduct.id) {
        // Editing existing product
        const result = await updateProduct(editingProduct.id, productData)
        if (!result.success) {
          alert(`Error: ${result.error}`)
          setIsProcessing(false)
          return
        }
        productId = editingProduct.id
      } else {
        // Adding new product
        const result = await addProduct(productData)
        if (!result.success) {
          alert(`Error: ${result.error}`)
          setIsProcessing(false)
          return
        }
        productId = result.product!.id
      }

      // Sync recipes
      if (recipeItems.length > 0) {
        const recipes = recipeItems.map((item) => ({
          ingredient_id: item.ingredient_id,
          quantity: item.quantity,
        }))
        const recipeResult = await syncProductRecipes(productId, recipes)
        if (!recipeResult.success) {
          alert(`Product saved but recipe error: ${recipeResult.error}`)
        }
      } else {
        // Clear recipes if none exist
        await syncProductRecipes(productId, [])
      }

      setEditingProduct(null)
      setFormData({ name: '', category: '', price: '', image_url: '' })
      setSelectedImage(null)
      setImagePreview(null)
      setRecipeItems([])
      await loadProducts()
      await loadCategories()
      alert('Product saved successfully!')
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleDelete(productId: string) {
    if (!confirm('Are you sure you want to delete this product?')) return

    const result = await deleteProduct(productId)
    if (result.success) {
      await loadProducts()
      await loadCategories()
      if (editingProduct?.id === productId) {
        setEditingProduct(null)
        setFormData({ name: '', category: '', price: '' })
        setRecipeItems([])
      }
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCategoryName.trim()) return

    // Check if category already exists
    if (categories.includes(newCategoryName.trim())) {
      alert('This category already exists')
      return
    }

    // Categories are added when products use them, so we just update the list
    setCategories([...categories, newCategoryName.trim()].sort())
    setNewCategoryName('')
  }

  async function handleRenameCategory(oldName: string) {
    if (!editingCategoryName.trim() || editingCategoryName.trim() === oldName) {
      setEditingCategory(null)
      setEditingCategoryName('')
      return
    }

    const result = await renameCategory(oldName, editingCategoryName.trim())
    if (result.success) {
      await loadProducts()
      await loadCategories()
      setEditingCategory(null)
      setEditingCategoryName('')
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  async function handleDeleteCategory(categoryName: string) {
    if (!confirm(`Are you sure you want to delete the category "${categoryName}"?`)) return

    const result = await deleteCategory(categoryName)
    if (result.success) {
      await loadCategories()
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product)
    setEditingCategory(null)
  }

  function handleCancel() {
    setEditingProduct(null)
    setFormData({ name: '', category: '', price: '', image_url: '' })
    setSelectedImage(null)
    setImagePreview(null)
    setRecipeItems([])
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        e.target.value = '' // Reset input
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB')
        e.target.value = '' // Reset input
        return
      }

      setSelectedImage(file)
      
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      // Reset if no file selected
      setSelectedImage(null)
      if (editingProduct && editingProduct.id) {
        setImagePreview(editingProduct.image_url || null)
      } else {
        setImagePreview(null)
      }
    }
  }

  function handleEditCategory(category: string) {
    setEditingCategory(category)
    setEditingCategoryName(category)
    setEditingProduct(null)
  }

  function handleAddIngredient() {
    if (!selectedIngredient) return

    const ingredient = ingredients.find((i) => i.id === selectedIngredient)
    if (!ingredient) return

    // Check if already added
    if (recipeItems.some((r) => r.ingredient_id === selectedIngredient)) {
      alert('This ingredient is already in the recipe')
      return
    }

    setRecipeItems([
      ...recipeItems,
      {
        ingredient_id: selectedIngredient,
        ingredient_name: ingredient.name,
        quantity: 0,
        unit: ingredient.unit,
      },
    ])
    setSelectedIngredient('')
  }

  function handleRemoveIngredient(index: number) {
    setRecipeItems(recipeItems.filter((_, i) => i !== index))
  }

  function handleUpdateQuantity(index: number, quantity: number) {
    const updated = [...recipeItems]
    updated[index].quantity = quantity
    setRecipeItems(updated)
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full min-h-screen">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Products Table */}
        <div className="lg:col-span-2 flex flex-col gap-6 h-full">
          <div className="flex flex-col gap-4">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">Manage Products</h2>
              <button
                onClick={() => {
                  setEditingProduct({ id: '', name: '', price: 0, category: null } as Product)
                  setEditingCategory(null)
                  setFormData({ name: '', category: '', price: '' })
                  setRecipeItems([])
                }}
                className="flex items-center justify-center gap-2 h-12 px-4 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                <span className="material-symbols-outlined">add</span>
                <span className="text-sm font-medium">Add New Product</span>
              </button>
            </div>

            <div className="flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden flex-grow">
              <div className="px-6 py-4 border-b border-gray-200">
                <label className="flex flex-col h-10 w-full max-w-sm">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
                    <div className="text-gray-400 flex border-none bg-input-gray items-center justify-center pl-4 rounded-l-lg border-r-0">
                      <span className="material-symbols-outlined">search</span>
                    </div>
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-gray-900 focus:outline-0 focus:ring-0 border-none bg-input-gray focus:border-none h-full placeholder:text-gray-500 px-4 rounded-l-none border-l-0 pl-2 text-base font-normal leading-normal"
                      placeholder="Find a product..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </label>
              </div>

              <div className="flex-grow overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="px-6 py-3 text-xs font-medium uppercase text-gray-600">
                        Product
                      </th>
                      <th className="px-6 py-3 text-xs font-medium uppercase text-gray-400">
                        Category
                      </th>
                      <th className="px-6 py-3 text-xs font-medium uppercase text-gray-400">
                        Price
                      </th>
                      <th className="px-6 py-3 text-xs font-medium uppercase text-gray-400 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-amber-800 to-amber-600 rounded-md flex-shrink-0"></div>
                            <p className="text-gray-900 text-sm font-medium">{product.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {product.category || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          ${product.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <span className="material-symbols-outlined !text-xl">edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <span className="material-symbols-outlined !text-xl">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Category Management or Product Form */}
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-6 flex flex-col h-fit">
          {editingProduct && editingProduct.id ? (
            <>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Product</h3>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label
                    className="text-gray-600 text-sm font-medium mb-2 block"
                    htmlFor="product-name"
                  >
                    Product Name
                  </label>
                  <input
                    required
                    className="form-input w-full rounded-lg text-gray-900 bg-input-gray border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                    id="product-name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label
                    className="text-gray-600 text-sm font-medium mb-2 block"
                    htmlFor="product-category"
                  >
                    Category
                  </label>
                  <select
                    className="form-select w-full rounded-lg text-gray-900 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                    id="product-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    className="text-gray-600 text-sm font-medium mb-2 block"
                    htmlFor="product-price"
                  >
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-600">
                      $
                    </span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input w-full rounded-lg text-gray-900 bg-gray-300 border-gray-400 focus:border-gray-900 focus:ring-gray-900 pl-7"
                      id="product-price"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-sm font-medium mb-2 block">
                    Product Image
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      {imagePreview ? (
                        <div className="relative w-full h-full">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setSelectedImage(null)
                              // If editing, restore original image, otherwise clear
                              if (editingProduct && editingProduct.id) {
                                setImagePreview(editingProduct.image_url || null)
                              } else {
                                setImagePreview(null)
                              }
                            }}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 z-10"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <span className="material-symbols-outlined text-gray-500 mb-2">
                            upload_file
                          </span>
                          <p className="mb-2 text-sm text-gray-400">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">SVG, PNG, JPG (MAX. 5MB)</p>
                        </div>
                      )}
                      <input
                        className="hidden"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                      />
                    </label>
                  </div>
                </div>

                {/* Recipe Ingredients Section */}
                <div className="border-t border-gray-200 my-2"></div>
                <div>
                  <h4 className="text-gray-300 text-sm font-semibold mb-3">Recipe Ingredients</h4>
                  <div className="space-y-3">
                    {recipeItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <p className="text-sm text-gray-900 flex-1">{item.ingredient_name}</p>
                        <div className="flex items-center gap-2">
                          <input
                            className="form-input w-20 rounded-lg text-gray-900 text-sm bg-gray-300 border-gray-400 focus:border-gray-900 focus:ring-gray-900 text-center"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(index, parseFloat(e.target.value) || 0)
                            }
                          />
                          <span className="text-sm text-gray-400">{item.unit}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(index)}
                          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <span className="material-symbols-outlined !text-xl">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <select
                      className="form-select w-full rounded-lg text-gray-900 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                      value={selectedIngredient}
                      onChange={(e) => setSelectedIngredient(e.target.value)}
                    >
                      <option value="" disabled>
                        Select an ingredient
                      </option>
                      {ingredients
                        .filter(
                          (ing) => !recipeItems.some((r) => r.ingredient_id === ing.id)
                        )
                        .map((ingredient) => (
                          <option key={ingredient.id} value={ingredient.id}>
                            {ingredient.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      disabled={!selectedIngredient}
                      className="flex items-center justify-center gap-2 h-10 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined">add</span>
                      <span className="text-sm font-medium">Add</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="h-10 px-4 rounded-lg bg-button-gray text-gray-900 text-sm font-medium hover:bg-[#D0D0D0] transition-colors border border-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="h-10 px-4 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Saving...' : editingProduct.id ? 'Update Product' : 'Save Product'}
                  </button>
                </div>
              </form>
            </>
          ) : editingProduct && !editingProduct.id ? (
            <>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Product</h3>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label
                    className="text-gray-600 text-sm font-medium mb-2 block"
                    htmlFor="product-name-new"
                  >
                    Product Name
                  </label>
                  <input
                    required
                    className="form-input w-full rounded-lg text-gray-900 bg-input-gray border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                    id="product-name-new"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label
                    className="text-gray-600 text-sm font-medium mb-2 block"
                    htmlFor="product-category-new"
                  >
                    Category
                  </label>
                  <select
                    className="form-select w-full rounded-lg text-gray-900 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                    id="product-category-new"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    className="text-gray-600 text-sm font-medium mb-2 block"
                    htmlFor="product-price-new"
                  >
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-600">
                      $
                    </span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input w-full rounded-lg text-gray-900 bg-gray-300 border-gray-400 focus:border-gray-900 focus:ring-gray-900 pl-7"
                      id="product-price-new"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-sm font-medium mb-2 block">
                    Product Image
                  </label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-700 border-dashed rounded-lg cursor-pointer bg-gray-900 hover:bg-gray-800 relative">
                      {imagePreview ? (
                        <>
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <span className="text-gray-900 text-sm font-medium">Click to change image</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setSelectedImage(null)
                              setImagePreview(null)
                            }}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 z-10"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <span className="material-symbols-outlined text-gray-500 mb-2">
                            upload_file
                          </span>
                          <p className="mb-2 text-sm text-gray-400">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">SVG, PNG, JPG (MAX. 5MB)</p>
                        </div>
                      )}
                      <input
                        className="hidden"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        id="product-image-new"
                      />
                    </label>
                  </div>
                </div>

                {/* Recipe Ingredients Section */}
                <div className="border-t border-gray-200 my-2"></div>
                <div>
                  <h4 className="text-gray-300 text-sm font-semibold mb-3">Recipe Ingredients</h4>
                  <div className="space-y-3">
                    {recipeItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <p className="text-sm text-gray-900 flex-1">{item.ingredient_name}</p>
                        <div className="flex items-center gap-2">
                          <input
                            className="form-input w-20 rounded-lg text-gray-900 text-sm bg-gray-300 border-gray-400 focus:border-gray-900 focus:ring-gray-900 text-center"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(index, parseFloat(e.target.value) || 0)
                            }
                          />
                          <span className="text-sm text-gray-400">{item.unit}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(index)}
                          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <span className="material-symbols-outlined !text-xl">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <select
                      className="form-select w-full rounded-lg text-gray-900 bg-white border-gray-300 focus:border-gray-900 focus:ring-gray-900"
                      value={selectedIngredient}
                      onChange={(e) => setSelectedIngredient(e.target.value)}
                    >
                      <option value="" disabled>
                        Select an ingredient
                      </option>
                      {ingredients
                        .filter(
                          (ing) => !recipeItems.some((r) => r.ingredient_id === ing.id)
                        )
                        .map((ingredient) => (
                          <option key={ingredient.id} value={ingredient.id}>
                            {ingredient.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      disabled={!selectedIngredient}
                      className="flex items-center justify-center gap-2 h-10 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined">add</span>
                      <span className="text-sm font-medium">Add</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="h-10 px-4 rounded-lg bg-button-gray text-gray-900 text-sm font-medium hover:bg-[#D0D0D0] transition-colors border border-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="h-10 px-4 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Saving...' : 'Save Product'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-white mb-4">Manage Categories</h3>
          <div className="flex flex-col gap-3">
            {categories.map((category) => (
              <div
                key={category}
                className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
              >
                {editingCategory === category ? (
                  <input
                    type="text"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    onBlur={() => handleRenameCategory(category)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameCategory(category)
                      } else if (e.key === 'Escape') {
                        setEditingCategory(null)
                        setEditingCategoryName('')
                      }
                    }}
                    className="flex-1 bg-gray-800 text-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-white"
                    autoFocus
                  />
                ) : (
                  <p className="text-white text-sm">{category}</p>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditCategory(category)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <span className="material-symbols-outlined !text-xl">edit</span>
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <span className="material-symbols-outlined !text-xl">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 my-4"></div>
          <h4 className="text-base font-semibold text-white mb-3">Add New Category</h4>
          <form onSubmit={handleAddCategory} className="flex flex-col gap-4">
            <div>
              <label
                className="text-gray-400 text-sm font-medium mb-2 block"
                htmlFor="category-name"
              >
                Category Name
              </label>
              <input
                className="form-input w-full rounded-lg text-white bg-gray-900 border-gray-700 focus:border-white focus:ring-white"
                id="category-name"
                placeholder="e.g., Cold Brew"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Add Category
            </button>
          </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
