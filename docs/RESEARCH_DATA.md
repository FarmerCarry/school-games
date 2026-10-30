# Research data: the dictionary and how to read it

<!-- Written by `node server/dashboard/dictionary.js --md > docs/RESEARCH_DATA.md` from server/dashboard/dictionary.js; do not edit by hand. -->

The dashboard's **Data & settings** tab downloads the school's play as research files: `school-games-data_<from>_<to>.zip`, one CSV file per
kind of row plus `games.csv`, `dictionary.csv` (this page as a table), `README.txt` (in English and Arabic), `labels.sps` (SPSS) and `load.R` (R).
The server writes the rows (`GET /v1/admin/export`, `server/README.md`); the browser adds the headers, the byte-order mark and the other files.
The design is in `docs/RESEARCH_TELEMETRY_SPEC.md` (§E, §F.6).

## The files

| File | One row per | Written by |
|---|---|---|
| `students.csv` | student code with play in the period | the server |
| `sessions.csv` | play session | the server |
| `visits.csv` | game visit (a game opened in a session) | the server |
| `rounds.csv` | round of a game | the server |
| `events.csv` | event in a session | the server |
| `student_days.csv` | student code and school day with play | the server |
| `daily_games.csv` | day, clock, age group and game | the server |
| `pcs.csv` | PC code with play in the period | the server |
| `games.csv` | game of the games site | the browser |
| `dictionary.csv` | column of a file | the browser |

Every file is UTF-8 with a byte-order mark, comma-separated, with `.` as the decimal mark and an empty cell for a value that is
unknown or does not apply (`-1` never appears). Days, weekdays (1 = Sunday … 7 = Saturday) and times are the school's clock. No value of the
server's files needs quoting: each is a number, a date, a time or a validated token. `rounds.csv` becomes `rounds-YYYY-MM.csv` when the period
has more than 500,000 rounds (Excel stops at 1,048,576 rows).

## How the measures are made

* **Students.** A student is a profile's random code (`student`); `student_linked` is the code a child counts under after a teacher's code
  transfer or the owner's link, so a child on two PCs can be one student. Guests are counted in totals, never as students. There are no names.
* **Engaged time** (`minutes`, `engaged_s`, `engaged_ms`) is time with a key press or click in the last 20 seconds; a visit that never closed
  still counts its running time.
* **Sessions** start when a child (or a guest) starts playing and end at the hand-over button, another player, 20 quiet minutes or the
  page closing (`end_reason`). A whole session counts on the school day it started.
* **Attempts** number a code's ended rounds of a game in the order the server received them (`attempt`); two-player rounds are left out of
  skill measures (`two_player`).
* **What came after a round** (the dashboard's persistence charts): the next round of the visit on the same level, another level, another
  game later in the session, or nothing.
* **Paired growth** compares the same children in the first and the last third of a period, each child weighing the same.
* **Small samples** (fewer than 5 children or 20 tries) are shown with a "based on 2 children" chip, never hidden.

## Things to know before analysing

1. Engaged time counts key presses and clicks within 20-second windows, so watching without touching (waiting for a turn, a long animation) is undercounted.
   يعدّ وقت اللعب الفعلي ضغطات المفاتيح والنقرات ضمن نوافذ مدتها 20 ثانية، فيُحسب أقل من حقيقته وقتُ المشاهدة دون لمس (انتظار الدور، أو حركة طويلة على الشاشة).
2. In the 3 games that adapt their difficulty, the win rate is held near 72% by design. Use the difficulty level and tier there as the measure of skill, not the win rate.
   في الألعاب الثلاث التي تكيّف صعوبتها تُبقى نسبة الفوز قرب 72% عن قصد. فاستخدم فيها مستوى الصعوبة ودرجتها مقياسًا للمهارة، لا نسبة الفوز.
3. A score means something different in each game (games.csv). Compare scores within one game only.
   للنتيجة معنى مختلف في كل لعبة (games.csv)، فلا تقارن النتائج إلا داخل اللعبة الواحدة.
4. Children choose their games, so comparisons between games are confounded by who chooses them.
   يختار الأطفال ألعابهم بأنفسهم، فالمقارنة بين الألعاب يشوبها اختلاف من يختار كل لعبة.
5. The age group is picked when the profile is made and does not move up a year. Use band_first as the cohort.
   تُختار الفئة العمرية عند إنشاء الملف ولا تتقدم مع مرور السنين، فاستخدم band_first لتحديد الفوج.
6. Two-player rounds (two children on one PC) are left out of the per-student skill measures.
   تُستبعد جولات اللاعبَين على جهاز واحد من مقاييس المهارة لكل طالب.
7. Identity errors happen: a child playing on another child’s profile (a tab left open; the 20-minute idle hand-over reduces this), a profile deleted and made again, a child on two PCs whose codes were never linked, a PC that forgets its profiles every night. Guests are never attributed to a student.
   تقع أخطاء في الهوية: طفل يلعب على ملف طفل آخر (تبويب تُرك مفتوحًا، ويقلل التسليم بعد 20 دقيقة دون نشاط من ذلك)، أو ملف حُذف ثم أُنشئ من جديد، أو طفل على جهازين لم يُربط رمزاه، أو جهاز ينسى ملفاته كل ليلة. ولا يُنسب لعب الضيوف إلى أي طالب.
8. Data is missing not at random: PCs where a teacher stopped the statistics, browsers that send Global Privacy Control, the offline copy of the site (which never sends), PCs on a network that blocks the statistics server (their play waits on the PC for up to 7 days), and PCs on the old version (student unknown).
   البيانات الناقصة ليست عشوائية: الأجهزة التي أوقف فيها المعلم الإحصاءات، والمتصفحات التي ترسل إشارة التحكم العام في الخصوصية، والنسخة غير المتصلة من الموقع (لا ترسل شيئًا)، والأجهزة على شبكة تحجب خادم الإحصاءات (ينتظر لعبها على الجهاز حتى 7 أيام)، وأجهزة الإصدار القديم (الطالب غير معروف).
9. attempt is the order in which the server received a code’s rounds of a game; on one PC that is the order of play. Numbering starts again for a new code unless the codes were linked before that play. Re-rank by time in your analysis if needed.
   attempt هو ترتيب استلام الخادم لجولات رمز ما في لعبة ما، وهو على الجهاز الواحد ترتيب اللعب نفسه. ويبدأ العدّ من جديد لرمز جديد ما لم يُربط الرمزان قبل ذلك اللعب. أعد الترتيب حسب الوقت في تحليلك إن احتجت.
10. Times are the session’s start (the server’s clock less the seconds the PC counted) plus the seconds into the session. Rows with clock_source r are estimated from the time the server received them.
   الأوقات هي بدء الجلسة (ساعة الخادم مطروحًا منها الثواني التي عدّها الجهاز) مضافًا إليه الثواني منذ بدء الجلسة. والصفوف التي clock_source فيها r مقدّرة من وقت استلام الخادم لها.
11. Days before the update (clock utc in daily_games.csv) are world-time (UTC) days by when the server received the play, with totals only.
   الأيام التي سبقت التحديث (clock = utc في daily_games.csv) أيام بالتوقيت العالمي (UTC) بحسب وقت استلام الخادم للعب، وفيها المجاميع فقط.
12. Use the paired comparisons for growth (the same children early and late); weekly averages mix new players with practised ones.
   استخدم المقارنات المزدوجة لقياس التحسن (الأطفال أنفسهم في البداية والنهاية)، فالمتوسطات الأسبوعية تخلط اللاعبين الجدد بالمتمرّسين.
13. Small numbers (fewer than 5 children or 20 tries) carry a chip on the dashboard. Read them as early signs, not findings.
   تحمل الأرقام الصغيرة (أقل من 5 أطفال أو 20 محاولة) علامة في لوحة المتابعة، فاقرأها إشارات مبكرة لا نتائج.

## The columns

Each file's columns in their order. *Available for*: `all games`, `DDA games`, `games with a score`, `tutorial games`, `games with frames` (the 3 adaptive games are bubble-bop, dino-3d and road-hopper). *Source* is the field the PC sends (`docs/TELEMETRY.md`), or *server*.

### `students.csv`: one row per student code with play in the period

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `student` | code |  | 12 hex digits | The student code: 12 random hex digits made for one child’s profile on one PC. Nothing about the child goes into it. | رمز الطالب: 12 خانة ست عشرية عشوائية تُنشأ لملف طفل واحد على جهاز واحد، ولا يدخل فيه شيء عن الطفل. | envelope.u | all games |
| `student_label` | text |  |  | The start of the code in capitals, as the dashboard shows it (Student 7F3A); longer when another code starts the same way. | بداية الرمز بأحرف كبيرة، وهي ما تعرضه لوحة المتابعة بعد كلمة «الطالب»، وتطول إذا بدأ رمز آخر بالبداية نفسها. | server | all games |
| `student_linked` | code |  | 12 hex digits | The code this student counts under: the newer code an older one was linked to (by a teacher’s code transfer or on the dashboard), else the student code itself. Group a child’s rows by it. Empty for a guest. | الرمز الذي يُحسب تحته هذا الطالب: الرمز الأحدث الذي رُبط به رمز أقدم (بنقل الرمز من صفحة المعلم أو من لوحة المتابعة)، وإلا فرمز الطالب نفسه. اجمع صفوف الطفل الواحد به. فارغ للضيف. | cd.oldCode, owner link | all games |
| `kind` | category |  | profile | Always profile: every student code belongs to a profile on a PC. | دائمًا profile: كل رمز طالب يخص ملفًا على جهاز. | server | all games |
| `band_first` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the code’s first session, as chosen when the profile was made. It does not move up a year, so use it as the cohort. | الفئة العمرية في أول جلسة لهذا الرمز كما اختيرت عند إنشاء الملف. لا تتقدم مع مرور السنين، فاستخدمها لتحديد الفوج. | envelope.a | all games |
| `band_last` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the code’s latest session. | الفئة العمرية في أحدث جلسة لهذا الرمز. | envelope.a | all games |
| `profile_made_day` | date |  |  | The day the profile was made: the day of its first session here less the profile’s age then. | يوم إنشاء الملف: يوم أول جلسة له هنا مطروحًا منه عمر الملف آنذاك. | ss.ageDays | all games |
| `first_day` | date |  |  | The day of the first play the server keeps for this code, in any period. | يوم أول لعب يحتفظ به الخادم لهذا الرمز، في أي فترة. | server | all games |
| `last_day` | date |  |  | The day of the latest play the server keeps for this code, in any period. | يوم آخر لعب يحتفظ به الخادم لهذا الرمز، في أي فترة. | server | all games |
| `days_active` | integer | days |  | Days with play in the exported period. | الأيام التي لعب فيها خلال الفترة المصدَّرة. | server | all games |
| `sessions` | integer |  |  | Play sessions in the period. | جلسات اللعب خلال الفترة. | ss | all games |
| `minutes` | decimal | min |  | Engaged minutes in the period (see the note on engaged time). | دقائق اللعب الفعلي خلال الفترة (انظر الملاحظة عن وقت اللعب الفعلي). | gx.engagedMs, gp.engagedMs | all games |
| `rounds` | integer |  |  | Rounds ended in the period. | الجولات المنتهية خلال الفترة. | re | all games |
| `wins` | integer |  |  | Rounds won. | الجولات التي فاز بها. | re.code | all games |
| `losses` | integer |  |  | Rounds lost. | الجولات التي خسرها. | re.code | all games |
| `quits` | integer |  |  | Rounds left unfinished. | الجولات التي تُركت دون إنهاء. | re.code | all games |
| `games_tried` | integer |  |  | Different games played in the period. | عدد الألعاب المختلفة التي لعبها خلال الفترة. | go.slug | all games |
| `favourite_game` | text | slug |  | The game with the most engaged minutes in the period (a tie goes to the first id in alphabetical order). | اللعبة التي نالت أكثر دقائق اللعب الفعلي خلال الفترة (عند التساوي: أول معرّف أبجديًا). | go.slug, gx.engagedMs | all games |
| `pcs` | integer |  |  | PCs this code has played on: one, or more when a teacher gave a profile on another PC the same code. | عدد الأجهزة التي لُعب عليها بهذا الرمز: جهاز واحد، أو أكثر حين أعطى المعلم ملفًا على جهاز آخر الرمز نفسه. | envelope.p | all games |
| `known_before` | flag |  | 0, 1 | 1 when the profile was made before the first play the server keeps for it: a child who played before the research data began. | 1 إذا أُنشئ الملف قبل أول لعب يحتفظ به الخادم له: طفل لعب قبل بدء بيانات البحث. | ss.ageDays | all games |
| `removed_day` | date |  |  | The day a PC removed this profile: the record stops there (censoring, not drop-out). Empty when it was not removed. | اليوم الذي حُذف فيه هذا الملف من جهاز: يتوقف سجله عنده (انقطاع في الرصد لا انسحاب). فارغ إن لم يُحذف. | pr.code | all games |

### `sessions.csv`: one row per play session

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `session` | code |  | 12 hex digits | The play session: a random id made when a child or a guest starts playing, and again at each change of player. | جلسة اللعب: معرّف عشوائي يُنشأ حين يبدأ طفل أو ضيف اللعب، ويتجدد عند كل تغيير للاعب. | envelope.s | all games |
| `student` | code |  | 12 hex digits | The student code; empty for a guest and for PCs on the old version. | رمز الطالب؛ فارغ للضيف ولأجهزة الإصدار القديم. | envelope.u | all games |
| `student_linked` | code |  | 12 hex digits | The code this student counts under: the newer code an older one was linked to (by a teacher’s code transfer or on the dashboard), else the student code itself. Group a child’s rows by it. Empty for a guest. | الرمز الذي يُحسب تحته هذا الطالب: الرمز الأحدث الذي رُبط به رمز أقدم (بنقل الرمز من صفحة المعلم أو من لوحة المتابعة)، وإلا فرمز الطالب نفسه. اجمع صفوف الطفل الواحد به. فارغ للضيف. | cd.oldCode, owner link | all games |
| `pc` | code |  | 12 hex digits | The PC code: 12 random hex digits made once on each PC. Empty for PCs on the old version. | رمز الجهاز: 12 خانة ست عشرية عشوائية تُنشأ مرة واحدة على كل جهاز. فارغ لأجهزة الإصدار القديم. | envelope.p | all games |
| `kind` | category |  | student, guest, unknown | student: a child with a profile; guest: played without picking an animal; unknown: a PC on the old version (wire 2), which does not tell students apart. | student: طفل له ملف؛ guest: لعب دون اختيار حيوان؛ unknown: جهاز بالإصدار القديم (الإصدار 2) الذي لا يميّز الطلاب. | envelope.u, envelope.v | all games |
| `wire_version` | integer |  | 2, 3 | The version of the data the PC sent: 3 since the update, 2 from PCs not updated yet. | إصدار البيانات التي أرسلها الجهاز: 3 منذ التحديث، و2 من الأجهزة التي لم تُحدَّث بعد. | envelope.v | all games |
| `band` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the session: the profile’s, or the class default for a guest. | الفئة العمرية للجلسة: فئة الملف، أو الفئة الافتراضية للصف عند الضيف. | envelope.a | all games |
| `day` | date |  |  | The school day the session started. | اليوم الدراسي الذي بدأت فيه الجلسة. | envelope.w | all games |
| `weekday` | integer |  | 1–7 | The weekday of day: 1 Sunday … 7 Saturday. | يوم الأسبوع: 1 الأحد … 7 السبت. | server | all games |
| `start_time` | time |  |  | The time the session started. | وقت بدء الجلسة. | envelope.w | all games |
| `minute_of_day` | integer | min | 0–1439 | The start as minutes after midnight. | وقت البدء بالدقائق بعد منتصف الليل. | envelope.w | all games |
| `start_utc` | datetime |  |  | The start in world time (UTC): when the server received the play less the seconds the PC said had passed since the start. | وقت البدء بالتوقيت العالمي (UTC): وقت استلام الخادم للعب مطروحًا منه الثواني التي ذكر الجهاز أنها مضت منذ البدء. | envelope.w | all games |
| `clock_source` | category |  | w, r | w: dated from the seconds the PC itself counted; r: estimated from the time the server received the play (PCs on the old version, or a count that did not add up). | w: أُرّخت من الثواني التي عدّها الجهاز نفسه؛ r: قُدّرت من وقت استلام الخادم للعب (أجهزة الإصدار القديم، أو عدّ لم يستقم). | envelope.w | all games |
| `mode` | category |  | web, app | web: in a browser tab; app: the installed app. | web: في تبويب متصفح؛ app: التطبيق المثبّت. | envelope.m | all games |
| `build` | text |  |  | The version of the games site the PC ran (a build fingerprint). | إصدار موقع الألعاب على الجهاز (بصمة البناء). | envelope.k | all games |
| `cores` | integer |  | 1, 2, 4, 8, 16 | Processor cores, rounded down to one of these. | أنوية المعالج، مقرّبة إلى أقرب قيمة أدنى من هذه. | envelope.d[0] | all games |
| `memory_gb` | integer | GB | 0, 1, 2, 4, 8 | Memory as the browser reports it, rounded down to one of these (0: not reported). | الذاكرة كما يذكرها المتصفح، مقرّبة إلى أقرب قيمة أدنى من هذه (0: لم تُذكر). | envelope.d[1] | all games |
| `screen` | integer | px | 1366, 1600, 1920, 2560 | Screen width, rounded down to one of these. | عرض الشاشة، مقرّبًا إلى أقرب قيمة أدنى من هذه. | envelope.d[2] | all games |
| `classroom_mode` | flag |  | 0, 1 | 1 when the PC was in classroom mode. Empty for PCs on the old version. | 1 إذا كان الجهاز في وضع الصف. فارغ لأجهزة الإصدار القديم. | ss.cls | all games |
| `profiles_on_pc` | integer |  |  | Profiles on the PC when the session started (at most 24). Empty for PCs on the old version. | عدد الملفات على الجهاز عند بدء الجلسة (24 على الأكثر). فارغ لأجهزة الإصدار القديم. | ss.np | all games |
| `new_profile` | flag |  | 0, 1 | 1 when the profile was made in this session. | 1 إذا أُنشئ الملف في هذه الجلسة. | ss.isNew | all games |
| `profile_age_days` | integer | days |  | The profile’s age in days when the session started; empty for a guest. Empty for PCs on the old version. | عمر الملف بالأيام عند بدء الجلسة؛ فارغ للضيف. فارغ لأجهزة الإصدار القديم. | ss.ageDays | all games |
| `days_since_last` | integer | days |  | Days since the profile last played; empty for a guest, a new profile or one that never played. Empty for PCs on the old version. | الأيام منذ آخر لعب للملف؛ فارغ للضيف وللملف الجديد أو الذي لم يلعب قط. فارغ لأجهزة الإصدار القديم. | ss.sinceDays | all games |
| `profile_age_bucket` | integer |  | 0–3 | The profile’s age as the old version sends it: 0 new or a guest, 1 1–6 days, 2 7–29 days, 3 30 days or more. | عمر الملف كما يرسله الإصدار القديم: 0 جديد أو ضيف، 1 من يوم إلى 6 أيام، 2 من 7 إلى 29 يومًا، 3 ثلاثون يومًا فأكثر. | ss | all games |
| `days_since_last_bucket` | integer |  | 0–4 | Days since the last play as the old version sends it: 0 the same day, 1 one day, 2 2–6 days, 3 7 days or more, 4 the first time. | الأيام منذ آخر لعب كما يرسلها الإصدار القديم: 0 اليوم نفسه، 1 يوم واحد، 2 من يومين إلى 6 أيام، 3 سبعة أيام فأكثر، 4 أول مرة. | ss | all games |
| `level_start` | integer |  |  | The profile’s level (from its experience points) when the session started; 0 for a guest. | مستوى الملف (من نقاط خبرته) عند بدء الجلسة؛ 0 للضيف. | ss.level | all games |
| `level_ups` | integer |  |  | Times the profile went up a level in the session. | مرات ارتقاء الملف إلى مستوى أعلى في الجلسة. | lv | all games |
| `games_opened` | integer |  |  | Games opened in the session. | الألعاب التي فُتحت في الجلسة. | go | all games |
| `rounds` | integer |  |  | Rounds ended in the session. | الجولات المنتهية في الجلسة. | re | all games |
| `engaged_s` | decimal | s |  | Engaged seconds in the session’s games. | ثواني اللعب الفعلي في ألعاب الجلسة. | gx.engagedMs, gp.engagedMs | all games |
| `end_t_s` | integer | s |  | Seconds from the start to the session’s end; empty when the end never arrived (the PC switched off or lost its connection for good). | الثواني من البدء إلى نهاية الجلسة؛ فارغ إذا لم تصل النهاية (أُطفئ الجهاز أو انقطع اتصاله نهائيًا). | se.t | all games |
| `end_reason` | category |  | unload, switch, handover, idle | Why the session ended: unload, the page closed; switch, another player was picked; handover, the hand-over button; idle, 20 minutes without a touch. Empty for PCs on the old version. | سبب انتهاء الجلسة: unload أُغلقت الصفحة؛ switch اختير لاعب آخر؛ handover زر التسليم؛ idle عشرون دقيقة دون لمس. فارغ لأجهزة الإصدار القديم. | se.why | all games |
| `timer_minutes` | integer | min |  | The minutes of the first classroom timer started in the session; empty without a timer. Empty for PCs on the old version. | دقائق أول مؤقت صفي بدأ في الجلسة؛ فارغ إن لم يُستخدم مؤقت. فارغ لأجهزة الإصدار القديم. | ct | all games |
| `timer_ended` | flag |  | 0, 1 | 1 when a classroom timer ran out in the session, 0 when one was started but did not run out; empty without a timer. | 1 إذا انتهى وقت مؤقت صفي في الجلسة، و0 إذا بدأ مؤقت ولم ينتهِ وقته؛ فارغ إن لم يُستخدم مؤقت. | ct | all games |

### `visits.csv`: one row per game visit (a game opened in a session)

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `session` | code |  | 12 hex digits | The play session (sessions.csv). | جلسة اللعب (sessions.csv). | envelope.s | all games |
| `visit` | integer |  |  | The visit’s number in the session: 1 for the first game opened, and so on. | رقم الزيارة في الجلسة: 1 لأول لعبة فُتحت، وهكذا. | go.n | all games |
| `student` | code |  | 12 hex digits | The student code; empty for a guest and for PCs on the old version. | رمز الطالب؛ فارغ للضيف ولأجهزة الإصدار القديم. | envelope.u | all games |
| `student_linked` | code |  | 12 hex digits | The code this student counts under: the newer code an older one was linked to (by a teacher’s code transfer or on the dashboard), else the student code itself. Group a child’s rows by it. Empty for a guest. | الرمز الذي يُحسب تحته هذا الطالب: الرمز الأحدث الذي رُبط به رمز أقدم (بنقل الرمز من صفحة المعلم أو من لوحة المتابعة)، وإلا فرمز الطالب نفسه. اجمع صفوف الطفل الواحد به. فارغ للضيف. | cd.oldCode, owner link | all games |
| `band` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the session: the profile’s, or the class default for a guest. | الفئة العمرية للجلسة: فئة الملف، أو الفئة الافتراضية للصف عند الضيف. | envelope.a | all games |
| `day` | date |  |  | The school day the game was opened (or closed, when the opening was not seen). | اليوم الدراسي الذي فُتحت فيه اللعبة (أو أُغلقت، إن لم يُرصد الفتح). | go.t | all games |
| `open_time` | time |  |  | The time the game was opened. | وقت فتح اللعبة. | go.t | all games |
| `open_s` | integer | s |  | Seconds from the session’s start to the game’s opening. | الثواني من بدء الجلسة إلى فتح اللعبة. | go.t | all games |
| `close_s` | integer | s |  | Seconds from the session’s start to the game’s close; empty when it never closed. | الثواني من بدء الجلسة إلى إغلاق اللعبة؛ فارغ إذا لم تُغلق. | gx.t | all games |
| `open_seconds` | integer | s |  | Seconds the game was open (close_s − open_s). | الثواني التي بقيت فيها اللعبة مفتوحة (close_s − open_s). | go.t, gx.t | all games |
| `engaged_s` | decimal | s |  | Engaged seconds: time with a key press or click in the last 20 seconds. | ثواني اللعب الفعلي: الوقت الذي سبقته ضغطة مفتاح أو نقرة خلال 20 ثانية. | gx.engagedMs, gp.engagedMs | all games |
| `game` | text | slug |  | The game, by its id in games.csv. | اللعبة بمعرّفها في games.csv. | go.slug | all games |
| `source` | category |  | featured, catalog, recent, favorites, category, quick, search, related, surprise, reload, history, direct, starter | Where the game was opened: the featured tile, the home page tiles, played recently, favourites, a category, quick picks, search, related games, surprise me, a page reload, back or forward, a direct link, the starter game. | المكان الذي فُتحت منه اللعبة: البطاقة المميزة، أو بطاقات الصفحة الرئيسية، أو ما لُعب مؤخرًا، أو المفضلة، أو فئة، أو الاختيارات السريعة، أو البحث، أو الألعاب المشابهة، أو «فاجئني»، أو إعادة تحميل الصفحة، أو الرجوع والتقدم، أو رابط مباشر، أو لعبة البداية. | go.src | all games |
| `plays_before` | integer |  |  | The child’s visits to this game before this one (0 for a guest). Empty for PCs on the old version. | زيارات الطفل لهذه اللعبة قبل هذه الزيارة (0 للضيف). فارغ لأجهزة الإصدار القديم. | go.playsBefore | all games |
| `plays_before_bucket` | integer |  | 0–4 | plays_before as the old version sends it: 0, 1, 2 for 2–4, 3 for 5–9, 4 for 10 or more. | plays_before كما يرسلها الإصدار القديم: 0، 1، 2 لما بين 2 و4، 3 لما بين 5 و9، 4 لعشرة فأكثر. | go | all games |
| `favourite_at_open` | flag |  | 0, 1 | 1 when the child had given the game a heart before opening it. Empty for PCs on the old version. | 1 إذا كان الطفل قد وضع قلبًا على اللعبة قبل فتحها. فارغ لأجهزة الإصدار القديم. | go.fav | all games |
| `load_ms` | integer | ms |  | How long the game took to load. | مدة تحميل اللعبة. | ld.loadMs | all games |
| `error` | category |  | timeout, script, load | Why the game failed to start: it took too long, a script error, or a loading error; empty when it started. | سبب تعذّر بدء اللعبة: استغرقت وقتًا طويلًا، أو خطأ في البرنامج، أو خطأ في التحميل؛ فارغ إذا بدأت. | er.kind | all games |
| `rounds_started` | integer |  |  | Rounds started in the visit. | الجولات التي بدأت في الزيارة. | rs | all games |
| `rounds_ended` | integer |  |  | Rounds ended in the visit. | الجولات التي انتهت في الزيارة. | re | all games |
| `tutorial` | category |  | none, start, done | The game’s tutorial in this visit: none, started, or finished. | الدرس التعليمي للعبة في هذه الزيارة: none لم يظهر، start بدأ، done اكتمل. | tu.step | tutorial games |
| `hearts_on` | integer |  |  | Times the heart (favourite) button was turned on in the visit. Empty for PCs on the old version. | مرات تفعيل زر القلب (المفضلة) في الزيارة. فارغ لأجهزة الإصدار القديم. | fv.on | all games |
| `hearts_off` | integer |  |  | Times the heart button was turned off in the visit. Empty for PCs on the old version. | مرات إلغاء القلب في الزيارة. فارغ لأجهزة الإصدار القديم. | fv.on | all games |
| `il_lt8` | integer |  |  | Key presses and clicks the game answered in under 8 ms. | ضغطات المفاتيح والنقرات التي استجابت لها اللعبة في أقل من 8 ملّي ثانية. | gx.il[0] | all games |
| `il_lt16` | integer |  |  | … in 8 to under 16 ms. | … من 8 إلى أقل من 16 ملّي ثانية. | gx.il[1] | all games |
| `il_lt33` | integer |  |  | … in 16 to under 33 ms. | … من 16 إلى أقل من 33 ملّي ثانية. | gx.il[2] | all games |
| `il_lt50` | integer |  |  | … in 33 to under 50 ms. | … من 33 إلى أقل من 50 ملّي ثانية. | gx.il[3] | all games |
| `il_lt100` | integer |  |  | … in 50 to under 100 ms (a slow response). | … من 50 إلى أقل من 100 ملّي ثانية (استجابة بطيئة). | gx.il[4] | all games |
| `il_ge100` | integer |  |  | … in 100 ms or more (a slow response). | … في 100 ملّي ثانية فأكثر (استجابة بطيئة). | gx.il[5] | all games |
| `frames_smooth` | integer |  |  | Picture updates drawn within 20 ms (smooth). | تحديثات الصورة التي رُسمت خلال 20 ملّي ثانية (سلسة). | gx.f[0] | games with frames |
| `frames_ok` | integer |  |  | Picture updates drawn in 20 to 34 ms. | تحديثات الصورة التي رُسمت في 20 إلى 34 ملّي ثانية. | gx.f[1] | games with frames |
| `frames_choppy` | integer |  |  | Picture updates drawn in 34 to 250 ms (choppy). | تحديثات الصورة التي رُسمت في 34 إلى 250 ملّي ثانية (متقطعة). | gx.f[2] | games with frames |
| `frames_stall` | integer |  |  | Picture updates that took over 250 ms (a freeze). | تحديثات الصورة التي استغرقت أكثر من 250 ملّي ثانية (توقف). | gx.f[3] | games with frames |
| `closed` | flag |  | 0, 1 | 1 when the game was closed in the usual way; 0 when the page closed first (its minutes still count). | 1 إذا أُغلقت اللعبة بالطريقة المعتادة؛ 0 إذا أُغلقت الصفحة قبلها (وتبقى دقائقها محسوبة). | gx | all games |
| `previous_game` | text | slug |  | The game opened just before in the session; empty for the first. | اللعبة التي فُتحت قبلها مباشرة في الجلسة؛ فارغ للأولى. | go.n | all games |
| `next_game` | text | slug |  | The game opened just after in the session; empty for the last. | اللعبة التي فُتحت بعدها مباشرة في الجلسة؛ فارغ للأخيرة. | go.n | all games |

### `rounds.csv`: one row per round of a game

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `session` | code |  | 12 hex digits | The play session (sessions.csv). | جلسة اللعب (sessions.csv). | envelope.s | all games |
| `visit` | integer |  |  | The visit in the session (visits.csv). | الزيارة في الجلسة (visits.csv). | rs.n, re.n | all games |
| `round` | integer |  |  | The round’s number in the visit. | رقم الجولة في الزيارة. | rs.k, re.k | all games |
| `student` | code |  | 12 hex digits | The student code; empty for a guest and for PCs on the old version. | رمز الطالب؛ فارغ للضيف ولأجهزة الإصدار القديم. | envelope.u | all games |
| `student_linked` | code |  | 12 hex digits | The code this student counts under: the newer code an older one was linked to (by a teacher’s code transfer or on the dashboard), else the student code itself. Group a child’s rows by it. Empty for a guest. | الرمز الذي يُحسب تحته هذا الطالب: الرمز الأحدث الذي رُبط به رمز أقدم (بنقل الرمز من صفحة المعلم أو من لوحة المتابعة)، وإلا فرمز الطالب نفسه. اجمع صفوف الطفل الواحد به. فارغ للضيف. | cd.oldCode, owner link | all games |
| `pc` | code |  | 12 hex digits | The PC code: 12 random hex digits made once on each PC. Empty for PCs on the old version. | رمز الجهاز: 12 خانة ست عشرية عشوائية تُنشأ مرة واحدة على كل جهاز. فارغ لأجهزة الإصدار القديم. | envelope.p | all games |
| `band` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the session: the profile’s, or the class default for a guest. | الفئة العمرية للجلسة: فئة الملف، أو الفئة الافتراضية للصف عند الضيف. | envelope.a | all games |
| `day` | date |  |  | The school day the round started (or ended, when its start was not seen). | اليوم الدراسي الذي بدأت فيه الجولة (أو انتهت، إن لم يُرصد بدؤها). | rs.t, re.t | all games |
| `weekday` | integer |  | 1–7 | The weekday of day: 1 Sunday … 7 Saturday. | يوم الأسبوع: 1 الأحد … 7 السبت. | server | all games |
| `time` | time |  |  | The time the round started (or ended). | وقت بدء الجولة (أو انتهائها). | rs.t, re.t | all games |
| `start_s` | integer | s |  | Seconds from the session’s start to the round’s start; empty when the start was not seen. | الثواني من بدء الجلسة إلى بدء الجولة؛ فارغ إذا لم يُرصد البدء. | rs.t | all games |
| `minutes_into_session` | decimal | min |  | Minutes from the session’s start to the round’s start (or end). | الدقائق من بدء الجلسة إلى بدء الجولة (أو انتهائها). | rs.t, re.t | all games |
| `game` | text | slug |  | The game, by its id in games.csv. | اللعبة بمعرّفها في games.csv. | go.slug | all games |
| `level` | text |  |  | The round’s id in the game: its level or mode (for example L3 or endless). | معرّف الجولة في اللعبة: مرحلتها أو نمطها (مثل L3 أو endless). | rs.id, re.id | all games |
| `outcome` | category |  | win, loss, draw, end, quit; empty: never ended | How the round ended: win; loss; draw; end, a neutral end (endless runs, two-player modes); quit, left unfinished. Empty when it never ended. | كيف انتهت الجولة: win فوز؛ loss خسارة؛ draw تعادل؛ end نهاية محايدة (الجولات المتواصلة وأنماط اللاعبَين)؛ quit تُركت دون إنهاء. فارغ إذا لم تنتهِ. | re.code | all games |
| `previous_outcome` | category |  | win, loss, draw, end, quit; empty: never ended | The outcome of the round just before in the same visit; empty for the first. | نتيجة الجولة السابقة مباشرة في الزيارة نفسها؛ فارغ للأولى. | re.code | all games |
| `two_player` | flag |  | 0, 1 | 1 for a local two-player round (two children on one PC). These are left out of the skill measures. | 1 لجولة لاعبَين على جهاز واحد. تُستبعد هذه الجولات من مقاييس المهارة. | re.id | all games |
| `attempt` | integer |  |  | The student’s attempt at this game: the rounds of it the student has ended so far, this one included, in the order the server received them. | محاولة الطالب في هذه اللعبة: جولاتها التي أنهاها الطالب حتى الآن ومعها هذه الجولة، بترتيب استلام الخادم لها. | server | all games |
| `replay_in_session` | integer |  |  | Earlier starts of the same round id in this session. | مرات بدء معرّف الجولة نفسه قبلها في هذه الجلسة. | rs.replay | all games |
| `engaged_ms` | integer | ms |  | Engaged time in the round. | وقت اللعب الفعلي في الجولة. | re.ms | all games |
| `wall_ms` | integer | ms |  | Clock time from the round’s start to its end (games built with the newer kit). | الوقت بالساعة من بدء الجولة إلى نهايتها (في الألعاب المبنية بالنسخة الأحدث). | re.x[0] | all games |
| `score` | integer |  |  | The score the game passed; it means something different in each game (games.csv). | النتيجة التي مرّرتها اللعبة؛ يختلف معناها من لعبة إلى أخرى (games.csv). | re.score | games with a score |
| `tier_start` | integer |  | 0–9 | The difficulty tier at the start (0: the game has no tiers). | درجة الصعوبة عند البدء (0: لا درجات في اللعبة). | rs.tier | DDA games |
| `tier_end` | integer |  | 0–9 | The difficulty tier at the end (0: the game has no tiers). | درجة الصعوبة عند النهاية (0: لا درجات في اللعبة). | re.tier | DDA games |
| `dda_level` | integer | ‰ | 0–1000 | The difficulty level the game had chosen for this child, in thousandths (0 the easiest, 1000 the hardest); empty before the first adjustment. | مستوى الصعوبة الذي اختارته اللعبة لهذا الطفل، بالألف (0 الأسهل، 1000 الأصعب)؛ فارغ قبل أول تعديل. | re.x[6] | DDA games |
| `hits` | integer |  |  | Targets hit. | الأهداف التي أُصيبت. | re.hits | DDA games |
| `misses` | integer |  |  | Targets missed. | الأهداف التي أُخطئت. | re.misses | DDA games |
| `accuracy` | decimal |  | 0–1 | Accuracy: hits / (hits + misses); empty without either. | الدقة: hits / (hits + misses)؛ فارغة إذا لم يوجد أيّ منهما. | re.hits, re.misses | DDA games |
| `rt_lt300` | integer |  |  | Reactions faster than 300 ms. | الاستجابات الأسرع من 300 ملّي ثانية. | re.rt[0] | DDA games |
| `rt_lt500` | integer |  |  | Reactions in 300 to under 500 ms. | الاستجابات من 300 إلى أقل من 500 ملّي ثانية. | re.rt[1] | DDA games |
| `rt_lt800` | integer |  |  | Reactions in 500 to under 800 ms. | الاستجابات من 500 إلى أقل من 800 ملّي ثانية. | re.rt[2] | DDA games |
| `rt_lt1200` | integer |  |  | Reactions in 800 to under 1200 ms. | الاستجابات من 800 إلى أقل من 1200 ملّي ثانية. | re.rt[3] | DDA games |
| `rt_lt2000` | integer |  |  | Reactions in 1200 to under 2000 ms. | الاستجابات من 1200 إلى أقل من 2000 ملّي ثانية. | re.rt[4] | DDA games |
| `rt_ge2000` | integer |  |  | Reactions of 2000 ms or more. | الاستجابات في 2000 ملّي ثانية فأكثر. | re.rt[5] | DDA games |
| `rt_mean_ms` | integer | ms |  | The mean reaction time, exact (the sum of reaction times over their number). | متوسط زمن الاستجابة بدقة (مجموع أزمنة الاستجابة مقسومًا على عددها). | re.x[4], re.x[5] | DDA games |
| `rt_n` | integer |  |  | Reactions measured. | عدد الاستجابات المقيسة. | re.x[5] | DDA games |
| `inputs` | integer |  |  | Key presses and clicks in the round (games built with the newer kit). | ضغطات المفاتيح والنقرات في الجولة (في الألعاب المبنية بالنسخة الأحدث). | re.x[1] | all games |
| `inputs_per_min` | decimal | 1/min |  | inputs per minute of wall_ms. | inputs لكل دقيقة من wall_ms. | re.x[0], re.x[1] | all games |
| `idle_lapses` | integer |  |  | Times the child came back after 20 seconds without a touch, inside the round. | مرات عودة الطفل بعد 20 ثانية دون لمس، داخل الجولة. | re.x[2] | all games |
| `pauses` | integer |  |  | Times the round was paused (the game paused, or the window lost the focus). | مرات توقف الجولة مؤقتًا (أوقفت اللعبة، أو فقدت النافذة التركيز). | re.x[3] | all games |

### `events.csv`: one row per event in a session

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `session` | code |  | 12 hex digits | The play session (sessions.csv). | جلسة اللعب (sessions.csv). | envelope.s | all games |
| `student` | code |  | 12 hex digits | The student code; empty for a guest and for PCs on the old version. | رمز الطالب؛ فارغ للضيف ولأجهزة الإصدار القديم. | envelope.u | all games |
| `student_linked` | code |  | 12 hex digits | The code this student counts under: the newer code an older one was linked to (by a teacher’s code transfer or on the dashboard), else the student code itself. Group a child’s rows by it. Empty for a guest. | الرمز الذي يُحسب تحته هذا الطالب: الرمز الأحدث الذي رُبط به رمز أقدم (بنقل الرمز من صفحة المعلم أو من لوحة المتابعة)، وإلا فرمز الطالب نفسه. اجمع صفوف الطفل الواحد به. فارغ للضيف. | cd.oldCode, owner link | all games |
| `day` | date |  |  | The school day of the event. | اليوم الدراسي للحدث. | lv.t, fv.t, tu.t, ct.t, pr.t, cd.t | all games |
| `time` | time |  |  | The time of the event. | وقت الحدث. | lv.t, fv.t, tu.t, ct.t, pr.t, cd.t | all games |
| `t_s` | integer | s |  | Seconds from the session’s start to the event. | الثواني من بدء الجلسة إلى الحدث. | lv.t, fv.t, tu.t, ct.t, pr.t, cd.t | all games |
| `kind` | category |  | level_up, heart_on, heart_off, tutorial_start, tutorial_done, timer_start, timer_cancel, timer_end, profile_removed, linked | What happened: the profile went up a level; the heart was turned on or off; a tutorial started or was finished; a classroom timer started, was cancelled or ran out; a profile was removed from the PC; an older code was linked to this session’s student. | ما حدث: ارتقى الملف إلى مستوى أعلى؛ فُعّل القلب أو أُلغي؛ بدأ درس تعليمي أو اكتمل؛ بدأ مؤقت صفي أو أُلغي أو انتهى وقته؛ حُذف ملف من الجهاز؛ رُبط رمز أقدم بطالب هذه الجلسة. | lv, fv, tu, ct, pr, cd | all games |
| `game` | text | slug |  | The game of the visit the event happened in; empty outside a game. | لعبة الزيارة التي وقع فيها الحدث؛ فارغ خارج الألعاب. | fv.n, tu.n | all games |
| `value` | text |  |  | level_up: the new level; timer_start: its minutes; profile_removed and linked: the code; else empty. | level_up: المستوى الجديد؛ timer_start: دقائقه؛ profile_removed وlinked: الرمز؛ وإلا ففارغ. | lv.level, ct.minutes, pr.code, cd.oldCode | all games |

### `student_days.csv`: one row per student code and school day with play

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `student` | code |  | 12 hex digits | The student code; empty for a guest and for PCs on the old version. | رمز الطالب؛ فارغ للضيف ولأجهزة الإصدار القديم. | envelope.u | all games |
| `student_linked` | code |  | 12 hex digits | The code this student counts under: the newer code an older one was linked to (by a teacher’s code transfer or on the dashboard), else the student code itself. Group a child’s rows by it. Empty for a guest. | الرمز الذي يُحسب تحته هذا الطالب: الرمز الأحدث الذي رُبط به رمز أقدم (بنقل الرمز من صفحة المعلم أو من لوحة المتابعة)، وإلا فرمز الطالب نفسه. اجمع صفوف الطفل الواحد به. فارغ للضيف. | cd.oldCode, owner link | all games |
| `day` | date |  |  | The school day. | اليوم الدراسي. | server | all games |
| `weekday` | integer |  | 1–7 | The weekday of day: 1 Sunday … 7 Saturday. | يوم الأسبوع: 1 الأحد … 7 السبت. | server | all games |
| `band` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the day’s first session. | الفئة العمرية في أول جلسة من اليوم. | envelope.a | all games |
| `sessions` | integer |  |  | Play sessions that day. | جلسات اللعب في ذلك اليوم. | ss | all games |
| `minutes` | decimal | min |  | Engaged minutes that day. | دقائق اللعب الفعلي في ذلك اليوم. | gx.engagedMs, gp.engagedMs | all games |
| `opens` | integer |  |  | Games opened that day. | الألعاب التي فُتحت في ذلك اليوم. | go | all games |
| `games` | integer |  |  | Different games played that day. | عدد الألعاب المختلفة التي لُعبت في ذلك اليوم. | go.slug | all games |
| `rounds` | integer |  |  | Rounds ended that day. | الجولات المنتهية في ذلك اليوم. | re | all games |
| `wins` | integer |  |  | Rounds won. | الجولات التي فاز بها. | re.code | all games |
| `losses` | integer |  |  | Rounds lost. | الجولات التي خسرها. | re.code | all games |
| `draws` | integer |  |  | Rounds ended in a draw. | الجولات التي انتهت بالتعادل. | re.code | all games |
| `ends` | integer |  |  | Rounds with a neutral end (endless runs, two-player modes). | الجولات ذات النهاية المحايدة (الجولات المتواصلة وأنماط اللاعبَين). | re.code | all games |
| `quits` | integer |  |  | Rounds left unfinished. | الجولات التي تُركت دون إنهاء. | re.code | all games |
| `hits` | integer |  |  | Targets hit. | الأهداف التي أُصيبت. | re.hits | DDA games |
| `misses` | integer |  |  | Targets missed. | الأهداف التي أُخطئت. | re.misses | DDA games |
| `rt_mean_ms` | integer | ms |  | The mean reaction time, exact (the sum of reaction times over their number). | متوسط زمن الاستجابة بدقة (مجموع أزمنة الاستجابة مقسومًا على عددها). | re.x[4], re.x[5] | DDA games |
| `level_ups` | integer |  |  | Times the profile went up a level that day. | مرات ارتقاء الملف إلى مستوى أعلى في ذلك اليوم. | lv | all games |
| `first_time` | time |  |  | When the day’s first session started. | وقت بدء أول جلسة في اليوم. | envelope.w | all games |
| `last_time` | time |  |  | When the day’s latest session started. | وقت بدء آخر جلسة في اليوم. | envelope.w | all games |
| `pcs` | integer |  |  | PCs played on that day. | الأجهزة التي لُعب عليها في ذلك اليوم. | envelope.p | all games |

### `daily_games.csv`: one row per day, clock, age group and game

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `day` | date |  |  | The day. | اليوم. | server | all games |
| `clock` | category |  | school, utc | school: a day on the school’s clock; utc: a day before the update, in world time (UTC) by when the server received the play, without students or hearts. | school: يوم بحسب ساعة المدرسة؛ utc: يوم قبل التحديث بالتوقيت العالمي (UTC) بحسب وقت استلام الخادم للعب، دون الطلاب والقلوب. | server | all games |
| `band` | category |  | 6-7, 8-9, 10-11; empty: not set | The age group of the sessions. | الفئة العمرية للجلسات. | envelope.a | all games |
| `game` | text | slug |  | The game, by its id in games.csv. | اللعبة بمعرّفها في games.csv. | go.slug | all games |
| `sessions` | integer |  |  | Play sessions that opened the game. | جلسات اللعب التي فُتحت فيها اللعبة. | go | all games |
| `students` | integer |  |  | Different students who played it (each linked child once); empty on utc days. | عدد الطلاب المختلفين الذين لعبوها (كل طفل مرتبط مرة واحدة)؛ فارغ في أيام utc. | envelope.u | all games |
| `opens` | integer |  |  | Times the game was opened. | مرات فتح اللعبة. | go | all games |
| `minutes` | decimal | min |  | Engaged minutes in the game. | دقائق اللعب الفعلي في اللعبة. | gx.engagedMs, gp.engagedMs | all games |
| `starts` | integer |  |  | Rounds started. | الجولات التي بدأت. | rs | all games |
| `ends` | integer |  |  | Rounds ended (every outcome). | الجولات التي انتهت (بأي نتيجة). | re | all games |
| `wins` | integer |  |  | Rounds won. | الجولات التي فاز بها. | re.code | all games |
| `losses` | integer |  |  | Rounds lost. | الجولات التي خسرها. | re.code | all games |
| `draws` | integer |  |  | Rounds ended in a draw. | الجولات التي انتهت بالتعادل. | re.code | all games |
| `ends_neutral` | integer |  |  | Rounds with a neutral end (endless runs, two-player modes). | الجولات ذات النهاية المحايدة (الجولات المتواصلة وأنماط اللاعبَين). | re.code | all games |
| `quits` | integer |  |  | Rounds left unfinished. | الجولات التي تُركت دون إنهاء. | re.code | all games |
| `hearts_on` | integer |  |  | Hearts given in the game; empty on utc days. | القلوب التي مُنحت للعبة؛ فارغ في أيام utc. | fv.on | all games |
| `hearts_off` | integer |  |  | Hearts taken back; empty on utc days. | القلوب التي أُلغيت؛ فارغ في أيام utc. | fv.on | all games |
| `avg_tier` | decimal |  | 1–9 | The mean starting tier of the rounds that have one. | متوسط درجة الصعوبة عند البدء في الجولات التي لها درجة. | rs.tier | DDA games |
| `accuracy` | decimal |  | 0–1 | Accuracy: hits / (hits + misses). | الدقة: hits / (hits + misses). | re.hits, re.misses | DDA games |

### `pcs.csv`: one row per PC code with play in the period

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `pc` | code |  | 12 hex digits | The PC code: 12 random hex digits made once on each PC. PCs on the old version send none and are not listed. | رمز الجهاز: 12 خانة ست عشرية عشوائية تُنشأ مرة واحدة على كل جهاز. أجهزة الإصدار القديم لا ترسله فلا تظهر هنا. | envelope.p | all games |
| `pc_label` | text |  |  | The first 4 characters of the code in capitals, as the dashboard and the teacher page show it. | أول 4 خانات من الرمز بأحرف كبيرة، كما تعرضه لوحة المتابعة وصفحة المعلم. | server | all games |
| `first_day` | date |  |  | The first day the server saw this PC, in any period. | أول يوم رأى فيه الخادم هذا الجهاز، في أي فترة. | server | all games |
| `last_day` | date |  |  | The latest day the server saw this PC, in any period. | آخر يوم رأى فيه الخادم هذا الجهاز، في أي فترة. | server | all games |
| `days` | integer | days |  | Days with play in the period. | الأيام التي لُعب فيها خلال الفترة. | server | all games |
| `time_zone` | text |  |  | The time zone the PC last reported (for example Asia/Riyadh). | المنطقة الزمنية التي ذكرها الجهاز آخر مرة (مثل Asia/Riyadh). | envelope.z | all games |
| `build` | text |  |  | The version of the games site the PC ran last. | إصدار موقع الألعاب الذي شغّله الجهاز آخر مرة. | envelope.k | all games |
| `cores` | integer |  | 1, 2, 4, 8, 16 | Processor cores, rounded down to one of these. | أنوية المعالج، مقرّبة إلى أقرب قيمة أدنى من هذه. | envelope.d[0] | all games |
| `memory_gb` | integer | GB | 0, 1, 2, 4, 8 | Memory as the browser reports it, rounded down to one of these (0: not reported). | الذاكرة كما يذكرها المتصفح، مقرّبة إلى أقرب قيمة أدنى من هذه (0: لم تُذكر). | envelope.d[1] | all games |
| `screen` | integer | px | 1366, 1600, 1920, 2560 | Screen width, rounded down to one of these. | عرض الشاشة، مقرّبًا إلى أقرب قيمة أدنى من هذه. | envelope.d[2] | all games |
| `sessions` | integer |  |  | Play sessions in the period. | جلسات اللعب خلال الفترة. | ss | all games |
| `students` | integer |  |  | Different students who played on it (each linked child once). | عدد الطلاب المختلفين الذين لعبوا عليه (كل طفل مرتبط مرة واحدة). | envelope.u | all games |
| `guest_share` | decimal |  | 0–1 | Guest sessions / all sessions. | جلسات الضيوف / كل الجلسات. | envelope.u | all games |
| `minutes` | decimal | min |  | Engaged minutes in the period. | دقائق اللعب الفعلي خلال الفترة. | gx.engagedMs, gp.engagedMs | all games |
| `smooth_share` | decimal |  | 0–1 | Picture updates drawn within 20 ms / all picture updates. | تحديثات الصورة المرسومة خلال 20 ملّي ثانية / كل تحديثات الصورة. | gx.f | games with frames |
| `stall_share` | decimal |  | 0–1 | Picture updates over 250 ms / all picture updates. | تحديثات الصورة التي تجاوزت 250 ملّي ثانية / كل تحديثات الصورة. | gx.f | games with frames |
| `avg_load_ms` | integer | ms |  | The mean time a game took to load. | متوسط مدة تحميل اللعبة. | ld.loadMs | all games |
| `slow_input_share` | decimal |  | 0–1 | Key presses and clicks answered in 50 ms or more / all of them. | ضغطات المفاتيح والنقرات التي استُجيب لها في 50 ملّي ثانية فأكثر / كلها. | gx.il | all games |
| `failures` | integer |  |  | Games that failed to start. | الألعاب التي تعذّر بدؤها. | er | all games |
| `profiles_max` | integer |  |  | The most profiles the PC had at a session start (24 is full). | أكبر عدد من الملفات كان على الجهاز عند بدء جلسة (24 يعني امتلاءه). | ss.np | all games |
| `new_profiles` | integer |  |  | Profiles made on the PC in the period. | الملفات التي أُنشئت على الجهاز خلال الفترة. | ss.isNew | all games |

### `games.csv`: one row per game of the games site

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `game` | text | slug |  | The game’s id (the game column of the other files). | معرّف اللعبة (عمود game في الملفات الأخرى). | js/catalog.js | all games |
| `name_ar` | text |  |  | The game’s Arabic name on the site. | اسم اللعبة العربي على الموقع. | js/catalog.js | all games |
| `name_en` | text |  |  | The game’s English name. | اسم اللعبة الإنجليزي. | js/catalog.js | all games |
| `categories` | text |  | challenge, shooter, running, racing, two-player, sports, puzzle, strategy, arcade, idle, battle | The site’s categories of the game, separated by semicolons. | فئات اللعبة على الموقع، تفصل بينها فواصل منقوطة. | js/catalog.js | all games |
| `players` | integer |  |  | The most players at once. | أكبر عدد من اللاعبين في وقت واحد. | js/catalog.js | all games |
| `input_style` | category |  | pointer, keyboard, one-button, mixed | How the game is played: the mouse, the keyboard, one button, or mouse and keyboard. | طريقة اللعب: الفأرة، أو لوحة المفاتيح، أو زر واحد، أو الفأرة ولوحة المفاتيح معًا. | js/catalog.js | all games |
| `has_levels` | flag |  | 0, 1 | 1 when the period’s rounds of the game have two or more round ids (levels or modes); empty when nobody played it. | 1 إذا كان لجولات اللعبة خلال الفترة معرّفان أو أكثر (مراحل أو أنماط)؛ فارغ إذا لم يلعبها أحد. | rs.id | all games |
| `dda` | flag |  | 0, 1 | 1 when the game adapts its difficulty to each child (tier and dda_level). | 1 إذا كانت اللعبة تكيّف صعوبتها لكل طفل (tier وdda_level). | games/ (Kit.dda) | all games |
| `reports_hits` | flag |  | 0, 1 | 1 when the game counts hits and misses (accuracy). | 1 إذا كانت اللعبة تعدّ الإصابات والأخطاء (الدقة). | games/ (Kit.track) | all games |
| `reports_reaction` | flag |  | 0, 1 | 1 when the game measures reaction times. | 1 إذا كانت اللعبة تقيس أزمنة الاستجابة. | games/ (Kit.track) | all games |
| `reports_score` | flag |  | 0, 1 | 1 when the game passes a score. | 1 إذا كانت اللعبة تمرّر نتيجة. | Kit.stats.end | all games |
| `score_meaning_en` | text |  |  | What the score means in this game. | معنى النتيجة في هذه اللعبة، بالإنجليزية. | server/dashboard/scores.js | all games |
| `score_meaning_ar` | text |  |  | What the score means in this game, in Arabic. | معنى النتيجة في هذه اللعبة. | server/dashboard/scores.js | all games |
| `tutorial` | flag |  | 0, 1 | 1 when the game shows a tutorial the first time. | 1 إذا كانت اللعبة تعرض درسًا تعليميًا في المرة الأولى. | games/ (Kit.stats.tutorial) | all games |

### `dictionary.csv`: one row per column of a file

| Column | Type | Unit | Values | Meaning | المعنى | Source | Available for |
|---|---|---|---|---|---|---|---|
| `file` | text |  |  | The file, without .csv. | الملف، دون .csv. | server | all games |
| `column` | text |  |  | The column, in the file’s order. | العمود، بترتيبه في الملف. | server | all games |
| `type` | category |  | code, text, category, integer, decimal, flag, date, time, datetime | The kind of value. | نوع القيمة. | server | all games |
| `unit` | text |  |  | The unit: s, ms, min, days, GB, px, ‰, slug (a game id) or 1/min. | الوحدة: s ثانية، ms ملّي ثانية، min دقيقة، days أيام، GB، px بكسل، ‰ بالألف، slug معرّف لعبة، 1/min لكل دقيقة. | server | all games |
| `values` | text |  |  | The values a category takes, or the range. | القيم التي تأخذها الفئة، أو المدى. | server | all games |
| `meaning_en` | text |  |  | What the column means, in English. | معنى العمود بالإنجليزية. | server | all games |
| `meaning_ar` | text |  |  | What the column means, in Arabic. | معنى العمود بالعربية. | server | all games |
| `source` | text |  |  | Where it comes from: the field the PC sends (event.field, docs/TELEMETRY.md), or server for a value the server works out. | مصدره: الحقل الذي يرسله الجهاز (الحدث.الحقل، docs/TELEMETRY.md)، أو server لقيمة يحسبها الخادم. | server | all games |
| `available_for` | category |  | all games, DDA games, games with a score, tutorial games, games with frames | The games that fill it: all games, the games that adapt their difficulty (DDA games), the games with a score, the games with a tutorial, the games that report picture updates. | الألعاب التي تملؤه: كل الألعاب، أو الألعاب التي تكيّف صعوبتها (DDA games)، أو الألعاب ذات النتيجة، أو الألعاب ذات الدرس التعليمي، أو الألعاب التي ترسل تحديثات الصورة. | server | all games |
