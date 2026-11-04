import { updateRow } from '@/db/client';
import { addListItem } from '@/data/lists';
import { createProduct, getProduct, matchExistingProduct } from '@/data/products';
import { BundledItem, packagePrice } from '@/services/catalog/bundled';

/** Devuelve el producto del hogar que corresponde a un artículo del catálogo, creándolo (sin stock) si no existe. */
export async function productFromBundled(item: BundledItem): Promise<string> {
  const existing = await matchExistingProduct({ name: item.name, brand: item.brand, barcode: item.barcode, pkg: item.pkg });
  if (existing) {
    if (!existing.image_url && item.imageUrl) await updateRow('products', existing.id, { image_url: item.imageUrl });
    return existing.id;
  }
  return createProduct({
    name: item.name,
    brand: item.brand,
    barcode: item.barcode,
    image_url: item.imageUrl,
    category: item.category,
    subcategory: item.section,
    package_count: item.pkg?.count ?? null,
    package_amount: item.pkg?.amount ?? null,
    package_unit: item.pkg?.unit ?? null,
    packaging: item.format?.split(' ')[0]?.toLowerCase() ?? null,
    preferred_store: item.store,
    source: 'catalog',
  });
}

/** Añade un artículo del catálogo a una lista, enlazado a un producto del hogar y con su precio de referencia. */
export async function addBundledToList(listId: string, item: BundledItem, quantity = 1): Promise<string> {
  const productId = await productFromBundled(item);
  const p = await getProduct(productId);
  return addListItem(listId, {
    productId,
    name: p?.name ?? item.name,
    category: p?.category ?? item.category,
    quantity,
    estimatedPrice: packagePrice(item),
  });
}
