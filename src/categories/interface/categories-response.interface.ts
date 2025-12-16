export interface CategoriesResponse {
  id: string;
  name: string;
  parent_id: null | string;
}

export interface AllCategoriesResponse {
  categories: CategoriesResponse[];
}

export interface SubCategoriByCategoriResponse {
  id: string;
  name: string;
  subCategories: CategoriesResponse[];
}
