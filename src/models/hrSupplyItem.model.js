const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const hrSupplyItemSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'HrPurchaseArea', required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ['stationery', 'classroom', 'sports', 'technology', 'laboratory', 'music', 'maintenance', 'cleaning', 'construction', 'furniture', 'cafeteria', 'nursing', 'security', 'admin', 'other'],
      default: 'other',
      index: true,
    },
    itemType: { type: String, enum: ['consumable', 'asset'], default: 'consumable', index: true },
    unit: { type: String, trim: true, default: 'unidad' },
    unitCost: { type: Number, default: 0, min: 0 },
    sku: { type: String, trim: true, default: '' },
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    location: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

hrSupplyItemSchema.index({ schoolId: 1, areaId: 1, name: 1 }, { unique: true });
hrSupplyItemSchema.index({ schoolId: 1, areaId: 1, status: 1, stock: 1 });

module.exports = registerSchoolScopedModel('HrSupplyItem', hrSupplyItemSchema);
