import mongoose from 'mongoose';
import { DEFAULT_CLASS_NAMES, SchoolClass } from '../models/SchoolClass.js';

export async function ensureDefaultClasses() {
  const existing = await SchoolClass.find().select('name sortOrder').lean();
  const byName = new Map(existing.map((c) => [c.name, c]));

  for (let i = 0; i < DEFAULT_CLASS_NAMES.length; i += 1) {
    const name = DEFAULT_CLASS_NAMES[i];
    if (byName.has(name)) continue;
    await SchoolClass.create({ name, sortOrder: i, isActive: true });
  }
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
