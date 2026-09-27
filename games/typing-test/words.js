/*
 * أصابع البرق — word lists.
 * Plain words only: no tashkeel, no tatweel, no names of real people.
 * IMPORTANT: challenge codes pick words by their position in these lists, so every PC must
 * run the same version. Changing a list changes what a code produces (that's fine between
 * releases, but never edit these during a class challenge).
 */
window.TT_WORDS = {
  en: (
    'the and you that was for are with his they this have from one had word but not what all were when ' +
    'your can said there use she how will out her make like him time look two more write see first water ' +
    'call who now find long down day did get come made may new take little work our name good think say ' +
    'help boy came want show three small put well big home try hand play animal house mother answer learn ' +
    'add food plant school father keep tree never start city eye light head under story saw left close ' +
    'next hard open begin always both paper got run car night walk white sea grow river four book hear ' +
    'stop idea eat face watch far let above girl young talk soon song family apple banana cat dog bird ' +
    'fish horse rabbit lion tiger bear frog duck cake cookie pizza juice milk bread happy funny friend ' +
    'smile laugh jump swim dance sing draw color red blue green yellow orange purple pink brown black sun ' +
    'moon star sky rain snow wind cloud flower garden park beach ocean island forest rocket planet space ' +
    'robot game ball kite bike train boat plane bus teacher class lunch pencil desk chair table window ' +
    'door clock phone computer music puppy kitten turtle zebra monkey giraffe elephant dolphin whale ' +
    'penguin butterfly bee candy honey lemon grape cherry carrot tomato potato rice soup egg cheese sweet ' +
    'warm cold hot fast slow tall short soft loud quiet brave smart strong bright clean fresh nice best ' +
    'better win team goal score climb build paint bake share visit travel dream magic treasure castle ' +
    'crown gold coin gift party birthday holiday summer winter spring morning evening today tomorrow week ' +
    'month shoe hat shirt baby sister brother grass hill lake rainbow shell sand wave boot sock toy doll ' +
    'bell drum map farm cow sheep goat nest seed leaf ' +
    // very common short words (Monkeytype's lists are full of them, and they set the rhythm)
    'a to of in is it on at we go up my me he be do no so an as by or us if'
  ).split(' '),

  ar: (
    'مدرسة معلم معلمة طالب طالبة كتاب قلم دفتر ممحاة مسطرة حقيبة فصل سبورة درس واجب امتحان مكتبة صديق ' +
    'صديقة ملعب فسحة جرس رسم قراءة كتابة حساب علوم لغة سؤال جواب ورقة مقعد حاسوب شاشة مفتاح فكرة قصة ' +
    'كلمة حرف رقم جملة أب أم أخ أخت جد جدة عم عمة خال خالة ابن بنت عائلة طفل بيت غرفة باب نافذة سرير ' +
    'مطبخ حديقة جار قطة كلب حصان أسد نمر فيل زرافة قرد أرنب سلحفاة بطة دجاجة بقرة خروف جمل غزال ثعلب ' +
    'دب نحلة فراشة نملة سمكة حوت دلفين عصفور نسر ببغاء طاووس ضفدع خبز ماء حليب عصير تفاح موز برتقال ' +
    'عنب فراولة بطيخ ليمون تمر جزر طماطم بطاطا أرز جبن بيض عسل سكر ملح شاي كعكة حلوى حساء سلطة فطور ' +
    'غداء عشاء طعام أحمر أزرق أخضر أصفر أبيض أسود بني وردي برتقالي بنفسجي رمادي لون ألوان شمس قمر نجمة ' +
    'سماء أرض بحر نهر جبل شجرة زهرة وردة مطر ثلج ريح غيمة رمل صحراء غابة جزيرة شاطئ موج نار هواء صخرة ' +
    'عشب ضوء ليل نهار صباح مساء يوم أسبوع شهر سنة صيف شتاء ربيع خريف ساعة دقيقة وقت كتب قرأ ذهب جاء ' +
    'أكل شرب لعب نام فتح جلس وقف مشى ركض قفز سبح ضحك سمع رأى قال عمل فهم تعلم ساعد أحب وجد طار بنى ' +
    'حمل سأل أجاب نظر عاد خرج دخل زار طبخ غسل رتب زرع صعد نزل بدأ فاز حاول شكر ابتسم يكتب يقرأ يلعب ' +
    'يذهب يحب يركض يرسم يسبح نلعب نتعلم نقرأ تكتب تلعب يطير يأكل يشرب كبير صغير جميل سريع بطيء طويل ' +
    'قصير جديد قديم سعيد نظيف ذكي قوي لطيف حار بارد سهل صعب قريب بعيد واسع هادئ مفيد شجاع نشيط ممتع ' +
    'رائع لذيذ ثقيل خفيف كثير قليل أول آخر في من إلى على عن مع هذا هذه ذلك تلك هنا هناك كل بعض لا نعم ' +
    'ثم أو لكن قبل بعد فوق تحت أمام خلف بين عند كيف ماذا متى أين لماذا هو هي نحن أنا أنت هم الذي التي ' +
    'كان كانت ليس جدا أيضا دائما اليوم غدا أمس معا البيت الشمس القمر الولد البنت الماء الأرض السماء ' +
    'البحر الحديقة الصباح الكتاب الفصل الأسد الآن الإجابة الأزهار الألوان لاعب سلام أولاد بلاد علامة ' +
    'ملابس كلام ثلاثة طلاب فلاح ملاعق واحد اثنان أربعة خمسة ستة سبعة ثمانية تسعة عشرة يد رأس عين أذن ' +
    'أنف فم قدم شعر سيارة قطار طائرة سفينة دراجة حافلة طريق مدينة قرية سوق كرة لعبة هدية حفلة صورة ' +
    'رحلة نجاح فرح حلم أمل بالون هاتف مصباح كرسي طاولة مرآة مظلة قبعة حذاء قميص'
  ).split(' '),

  enS: [
    'The sun is bright and warm today.',
    'I like to read books at night.',
    'My cat sleeps on a soft chair.',
    'We play football at school.',
    'Can you help me find my red pencil?',
    'The little bird can sing a happy song.',
    'Practice makes perfect.',
    'A friend in need is a friend indeed.',
    'Look before you leap.',
    'The early bird catches the worm.',
    'Every day is a new chance to learn.',
    'I drink a glass of milk every morning.',
    'The rabbit likes to eat carrots.',
    'We planted a tree in the garden.',
    'Stars shine in the dark night sky.',
    'My brother can ride his bike fast.',
    'Let us draw a big blue whale!',
    'The turtle is slow, but it never gives up.',
    'Please close the door when you leave.',
    'Where did you put my green ball?',
    'Reading is fun and makes you smart.',
    'The train goes very fast on the track.',
    'It is raining, so take an umbrella.',
    'I help my mom cook dinner.',
    'The elephant has a long nose.',
    'We visit our grandparents on the weekend.',
    'Kind words make people smile.',
    'Teamwork makes the dream work.',
    'Wash your hands before you eat.',
    'The moon looks like a silver ball.',
    'My best friend loves to paint.',
    'What is your favorite color?',
    'The kite flew high over the hill.',
    'Winter is cold, and summer is hot.',
    'Always try your best!',
    'The puppy wags its tail when it is happy.',
    'Honey is sweet and yummy.',
    'Clean up your toys after you play.',
    'Two heads are better than one.',
    'Slow and steady wins the race.',
    'Thank you for being a good friend.',
    'Dolphins are smart and playful.'
  ],

  arS: [
    'الشمس تشرق كل صباح.',
    'أحب القراءة في المساء.',
    'العلم نور.',
    'من جد وجد، ومن زرع حصد.',
    'الصديق وقت الضيق.',
    'خير جليس في الزمان كتاب.',
    'العقل السليم في الجسم السليم.',
    'لكل مجتهد نصيب.',
    'اليد الواحدة لا تصفق.',
    'الصبر مفتاح الفرج.',
    'القناعة كنز لا يفنى.',
    'درهم وقاية خير من قنطار علاج.',
    'نلعب كرة القدم في الفسحة.',
    'أمي تطبخ طعاما لذيذا.',
    'هل قرأت قصة جديدة اليوم؟',
    'القطة الصغيرة تنام على الكرسي.',
    'أزرع وردة حمراء في الحديقة.',
    'الطيور تطير عاليا في السماء.',
    'نذهب إلى المدرسة مبكرا.',
    'أساعد أبي في ترتيب البيت.',
    'البحر واسع وأمواجه زرقاء.',
    'أكتب واجبي بخط جميل.',
    'ما أجمل الربيع وأزهاره!',
    'الرياضة تجعل الجسم قويا.',
    'أشرب الماء كل يوم.',
    'صديقي يحب الرسم والألوان.',
    'في الليل تلمع النجوم.',
    'الفيل حيوان كبير وذكي.',
    'أحب زيارة جدي وجدتي.',
    'أنظف أسناني قبل النوم.',
    'المكتبة مليئة بالكتب المفيدة.',
    'هيا نتعلم شيئا جديدا!',
    'السلحفاة بطيئة، لكنها لا تستسلم.',
    'أين وضعت قلمي الأزرق؟',
    'الشجرة تعطينا الظل والثمر.',
    'الأرنب يحب أكل الجزر.',
    'نحتفل بعيد ميلاد أخي غدا.',
    'الأصدقاء يساعد بعضهم بعضا.',
    'رتب غرفتك، واغسل يديك.',
    'العب بلطف، وشارك ألعابك.',
    'التعاون يجعل العمل سهلا.',
    'في الصيف نسبح في البحر.'
  ]
};
