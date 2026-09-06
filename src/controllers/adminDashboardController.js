import { Student } from '../models/Student.js';
import { Parent } from '../models/Parent.js';
import { Visitor } from '../models/Visitor.js';
import { ContactQuery } from '../models/ContactQuery.js';
import { Post } from '../models/Post.js';
import { News } from '../models/News.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getDashboardStats = asyncHandler(async (_req, res) => {
  const [
    studentCount,
    activeStudents,
    parentCount,
    activeParents,
    visitorDoc,
    contactCount,
    newContacts,
    postCount,
    newsCount,
  ] = await Promise.all([
    Student.countDocuments({ deletedAt: null }),
    Student.countDocuments({ isActive: true, deletedAt: null }),
    Parent.countDocuments(),
    Parent.countDocuments({ isActive: true }),
    Visitor.findOne({ key: 'global' }).lean(),
    ContactQuery.countDocuments(),
    ContactQuery.countDocuments({ status: 'new' }),
    Post.countDocuments(),
    News.countDocuments({ isActive: true }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      students: {
        total: studentCount,
        active: activeStudents,
      },
      parents: {
        total: parentCount,
        active: activeParents,
      },
      visitors: {
        total: visitorDoc?.count ?? 0,
      },
      contactQueries: {
        total: contactCount,
        new: newContacts,
      },
      posts: {
        total: postCount,
      },
      news: {
        active: newsCount,
      },
    },
  });
});
