import type { Course, HoleDef, LeagueData } from '../data/leagueTypes'
import styles from './editors.module.css'

type TeeKey = 'nonSenior' | 'senior'
type Side = 'front' | 'back'

/** Scorecard-style numbering: front 1–9, back 10–18 (stored holeNumber remains 1–9 per nine). */
function displayCourseHoleNumber(side: Side, index: number): number {
  return side === 'back' ? index + 10 : index + 1
}

function updateHole(
  course: Course,
  tee: TeeKey,
  side: Side,
  index: number,
  patch: Partial<HoleDef>,
): Course {
  const nine = course[tee][side]
  const holes = [...nine.holes]
  const prev = holes[index]
  if (!prev) return course
  holes[index] = { ...prev, ...patch }
  return {
    ...course,
    [tee]: {
      ...course[tee],
      [side]: { ...nine, holes },
    },
  }
}

export default function CourseEditor({
  data,
  onChange,
}: {
  data: LeagueData
  onChange: (next: LeagueData) => void
}) {
  const { course } = data

  function holeRow(tee: TeeKey, side: Side, h: HoleDef, index: number) {
    return (
      <tr key={`${tee}-${side}-${index}`}>
        <td className={styles.num}>{displayCourseHoleNumber(side, index)}</td>
        <td>
          <input
            className={styles.inputNarrow}
            type="number"
            min={3}
            max={6}
            value={h.par}
            onChange={(e) =>
              onChange({
                ...data,
                course: updateHole(course, tee, side, index, { par: Number(e.target.value) }),
              })
            }
          />
        </td>
        <td>
          <input
            className={styles.inputMed}
            type="number"
            min={0}
            max={700}
            value={h.yardage}
            onChange={(e) =>
              onChange({
                ...data,
                course: updateHole(course, tee, side, index, {
                  yardage: Number(e.target.value),
                }),
              })
            }
          />
        </td>
        <td>
          <input
            className={styles.inputNarrow}
            type="number"
            min={1}
            max={18}
            value={h.strokeIndex}
            onChange={(e) =>
              onChange({
                ...data,
                course: updateHole(course, tee, side, index, {
                  strokeIndex: Number(e.target.value),
                }),
              })
            }
          />
        </td>
      </tr>
    )
  }

  function nineTable(tee: TeeKey, side: Side) {
    const nine = course[tee][side]
    return (
      <div className={styles.nineBlock}>
        <div className={styles.nineHeader}>
          <h3 className={styles.nineTitle}>{nine.label}</h3>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Hole</th>
                <th>Par</th>
                <th>Yards</th>
                <th>Hcp 1–18</th>
              </tr>
            </thead>
            <tbody>{nine.holes.map((h, i) => holeRow(tee, side, h, i))}</tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.stack}>
      <label className={styles.field}>
        Course name
        <input
          className={styles.input}
          value={course.name}
          onChange={(e) => onChange({ ...data, course: { ...course, name: e.target.value } })}
        />
      </label>
      {nineTable('nonSenior', 'front')}
      {nineTable('nonSenior', 'back')}
      {nineTable('senior', 'front')}
      {nineTable('senior', 'back')}
    </div>
  )
}
