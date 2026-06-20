import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.productModel.estimatedDocumentCount();
    if (count === 0) {
      await this.productModel.insertMany([
        { name: 'Hamburguesa Clásica', priceCents: 850, stock: 50 },
        { name: 'Pizza Margarita', priceCents: 1200, stock: 30 },
        { name: 'Refresco', priceCents: 300, stock: 100 },
      ]);
    }
  }

  findAll() {
    return this.productModel.find().exec();
  }

  findById(id: string) {
    return this.productModel.findById(id).exec();
  }
}
