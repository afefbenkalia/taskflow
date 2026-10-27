import { api } from './client';

export type SearchKind = 'projects' | 'tasks' | 'people';

export interface SearchItem {
  id: number;
  title: string;
  subtitle: string;
  /** Page that opens the result, for the signed-in user's role. */
  link: string;
  color: string | null;
}

export interface SearchResults {
  query: string;
  groups: { kind: SearchKind; items: SearchItem[] }[];
}

/** Top bar search; the API scopes results to what the user may see. */
export async function searchWorkspace(q: string, signal?: AbortSignal): Promise<SearchResults> {
  const { data } = await api.get<SearchResults>('/search', { params: { q }, signal });
  return data;
}
