export interface RecommendationOption {
  id: string;
  label: string;
  createdAt: string;
}
export interface ValidationClientProps {
  recommendations: RecommendationOption[];
}
export interface ValidationCreateResponse {
  pageId: string;
  slug: string;
}
