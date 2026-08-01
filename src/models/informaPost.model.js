const mongoose = require('mongoose');

// Atlas M0 collection limit: reuse an existing empty control-DB collection.
const likeSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const commentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: '' },
    schoolName: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
    body: { type: String, required: true, trim: true },
    likes: { type: [likeSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const mediaSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video'], default: 'image' },
    src: { type: String, trim: true, default: '' },
    thumbUrl: { type: String, trim: true, default: '' },
    alt: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const informaPostSchema = new mongoose.Schema(
  {
    informaEntity: { type: String, default: 'post', index: true },
    author: {
      schoolId: { type: String, required: true, trim: true, index: true },
      userId: { type: String, required: true, trim: true, index: true },
      name: { type: String, trim: true, default: 'Comergio Informa' },
      role: { type: String, trim: true, default: 'super_admin' },
      photoUrl: { type: String, trim: true, default: '/informa/avatar-colibri.png' },
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    media: { type: [mediaSchema], default: [] },
    likes: { type: [likeSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'published', 'hidden', 'archived'],
      default: 'published',
      index: true,
    },
    source: {
      url: { type: String, trim: true, default: '' },
      title: { type: String, trim: true, default: '' },
      publisher: { type: String, trim: true, default: '' },
      topic: { type: String, trim: true, default: '' },
      fetchedAt: { type: Date, default: null },
    },
    auto: {
      enabled: { type: Boolean, default: false },
      slotKey: { type: String, trim: true, default: '', index: true },
      generatedAt: { type: Date, default: null },
      model: { type: String, trim: true, default: '' },
    },
    publishedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'enrollmentmatriculapurgerequests', strict: false }
);

informaPostSchema.index({ informaEntity: 1, status: 1, publishedAt: -1 });
informaPostSchema.index({ informaEntity: 1, 'source.url': 1 });
informaPostSchema.index({ informaEntity: 1, 'auto.slotKey': 1 });

module.exports = mongoose.models.InformaPost || mongoose.model('InformaPost', informaPostSchema);
