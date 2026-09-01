import productIdentities from '../data/daily_chemicals/product-identities.json' with { type: 'json' };
import type { SearchCandidate } from './web-search';

type ProductIdentity = {
  product_id: string;
  name: string;
  brand: string;
  category: string;
  product_type: string;
  official_urls?: string[];
};

const candidateById = new Map(
  (productIdentities as ProductIdentity[]).map((product) => [product.product_id, {
    productId: product.product_id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    productType: product.product_type,
    officialUrls: product.official_urls,
  } satisfies SearchCandidate]),
);

export function resolveSearchCandidates(value: unknown): SearchCandidate[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;
  if (!value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 100)) return null;
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) return null;
  const candidates = ids.map((id) => candidateById.get(id));
  return candidates.every(Boolean) ? candidates as SearchCandidate[] : null;
}
