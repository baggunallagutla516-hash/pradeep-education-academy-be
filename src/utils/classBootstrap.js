import mongoose from 'mongoose';
import { DEFAULT_CLASS_NAMES, SchoolClass } from '../models/SchoolClass.js';

/**
 * Seed built-in classes only on a fresh database.
 * Do not recreate names an admin has deleted — that was restoring Class 6–12
 * after every server restart.
 */
export async function ensureDefaultClasses() {
  const count = await SchoolClass.countDocuments();
  if (count > 0) return;

  await SchoolClass.insertMany(
    DEFAULT_CLASS_NAMES.map((name, i) => ({
      name,
      sortOrder: i,
      isActive: true,
    }))
  );
}

export async function migrateStringClassRefs() {
  const classes = await SchoolClass.find().select('name').lean();
  const idByName = new Map(classes.map((c) => [c.name, c._id]));

  const studentCol = mongoose.connection.collection('students');
  const worksheetCol = mongoose.connection.collection('worksheets');

  const stringStudents = await studentCol
    .find({ studentClass: { $type: 'string' } })
    .project({ _id: 1, studentClass: 1 })
    .toArray();

  for (const row of stringStudents) {
    const classId = idByName.get(row.studentClass);
    if (!classId) continue;
    await studentCol.updateOne({ _id: row._id }, { $set: { studentClass: classId } });
  }

  const stringWorksheets = await worksheetCol
    .find({ studentClass: { $type: 'string' } })
    .project({ _id: 1, studentClass: 1 })
    .toArray();

  for (const row of stringWorksheets) {
    const classId = idByName.get(row.studentClass);
    if (!classId) continue;
    await worksheetCol.updateOne({ _id: row._id }, { $set: { studentClass: classId } });
  }
}

export async function bootstrapClasses() {
  await ensureDefaultClasses();
  await migrateStringClassRefs();
}
