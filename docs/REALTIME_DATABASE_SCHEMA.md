# Realtime Database Schema Used by Admin

This inventory lists paths referenced by the Admin client. It is not a complete database schema and does not replace Firebase Rules documentation.

## Authorization paths

- `teachers/{username}`
- `teachers/{username}/moduleAccess`

The admin check reads `admin` and `moduleAccess.admin`.

## Student/topic/report paths

- `topics/{topic}/course`
- `topics/{topic}/students`
- `topics/{topic}/students/{studentName}`
- `students/{studentName}/studentId`
- `students/{studentName}/id`

## Diagnostic scan roots

The database-size module has a static list of known roots, including `students`, `teachers`, `topics`, `admin`, `sessionProofs`, `ai`, `activeClasses`, `lessons`, `notifications`, `gradingLocks`, `sessions`, `StudentMonitoring`, `CRMSettings`, `learningAideEvaluationReports`, and other shared system branches.

The scanner reads each known top-level branch separately and calculates JSON UTF-8 sizes. The source comments state that the database root is denied and therefore is not read directly.

## Writes

The generic RTDB update helper blocks paths beginning with `assignments` or `assignmentStudents`; assignment grading data is expected to use Firestore instead. Other RTDB write usage is not broadly documented in this repository.

