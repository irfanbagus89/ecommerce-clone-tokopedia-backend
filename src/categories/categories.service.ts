import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { CreateDto } from './dto/create.dto';
import {
  AllCategoriesResponse,
  CategoriesResponse,
  SubCategoriByCategoriResponse,
} from './interface/categories-response.interface';

interface Categories {
  id: string;
  name: string;
  parent_id: null | string;
}

@Injectable()
export class CategoriesService {
  constructor(@Inject('PG_POOL') private db: Pool) {}

  async createCategories(data: CreateDto): Promise<CategoriesResponse> {
    const createCategori = await this.db.query<Categories>(
      'INSERT INTO "categories" (name, parent_id) VALUES ($1, $2) RETURNING id, name, parent_id',
      [data.name, data.parent_id],
    );
    const result = createCategori.rows[0];
    return result;
  }

  async getCategories(): Promise<AllCategoriesResponse> {
    const categories = await this.db.query<Categories>(
      'SELECT id, name, parent_id FROM "categories" WHERE parent_id IS NULL',
    );

    if (categories.rows.length === 0) {
      throw new NotFoundException('Categori tidak ditemukan');
    }

    const result: AllCategoriesResponse = {
      categories: categories.rows.map((cat) => ({
        id: cat.id,
        name: cat.name,
        parent_id: cat.parent_id,
      })),
    };

    return result;
  }

  async getSubCategories(id: string): Promise<SubCategoriByCategoriResponse> {
    const categories = await this.db.query<Categories>(
      'SELECT id, name FROM "categories" WHERE id = $1',
      [id],
    );

    const subCategories = await this.db.query<Categories>(
      'SELECT id, name, parent_id FROM "categories" WHERE parent_id = $1',
      [id],
    );

    if (subCategories.rows.length === 0) {
      throw new NotFoundException('Categori tidak ditemukan');
    }

    const result: SubCategoriByCategoriResponse = {
      id: categories.rows[0].id,
      name: categories.rows[0].name,
      subCategories: subCategories.rows.map((cat) => ({
        id: cat.id,
        name: cat.name,
        parent_id: cat.parent_id,
      })),
    };

    return result;
  }
}
