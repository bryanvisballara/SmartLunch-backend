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
    kind: { type: String, enum: ['image'], default: 'image' },
    src: { type: String, trim: true, default: '' },
    thumbUrl: { type: String, trim: true, default: '' },
    alt: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const conectaCaseSchema = new mongoose.Schema(
  {
    conectaEntity: { type: String, default: 'case', index: true },
    author: {
      schoolId: { type: String, required: true, trim: true, index: true },
      userId: { type: String, required: true, trim: true, index: true },
      name: { type: String, trim: true, default: '' },
      role: { type: String, trim: true, default: '' },
      schoolName: { type: String, trim: true, default: '' },
      photoUrl: { type: String, trim: true, default: '' },
    },
    subjectKey: { type: String, trim: true, default: 'general', index: true },
    subjectLabel: { type: String, trim: true, default: 'General' },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    media: { type: [mediaSchema], default: [] },
    likes: { type: [likeSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    status: {
      type: String,
      enum: ['published', 'hidden', 'archived'],
      default: 'published',
      index: true,
    },
    publishedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'colibrigamescores', strict: false }
);

conectaCaseSchema.index({ conectaEntity: 1, status: 1, publishedAt: -1 });
conectaCaseSchema.index({ conectaEntity: 1, 'author.schoolId': 1, 'author.userId': 1, publishedAt: -1 });

module.exports = mongoose.models.ConectaCase || mongoose.model('ConectaCase', conectaCaseSchema);
