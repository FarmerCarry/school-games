/*
 * أصابع البرق (Lightning Fingers) — the words.
 * Simple, concrete kid words (animals, food, colours, school, family, nature) in plain
 * letters: no tashkeel, no tatweel, no names of people. Arabic and English each have
 * their own five worlds:
 *   w1  one list per level: home-row letters, top-row letters, bottom-row letters, 2-letter words
 *   w2  3-letter words      w3  4-letter words      w4  longer words      w5  short phrases
 * Worlds 2-5 are 'easy | harder': the DDA tier decides how many harder ones a level mixes in.
 * test / easy: the speed test and the class challenge draw from these.
 * IMPORTANT: a class challenge code picks words by their position in test / easy, so every
 * PC must run the same version of this file (never edit it during a class challenge).
 */
window.TT_WORDS = {
  ar: {
    w1: [
      'ب ت ن م ل ا س ي ك ش ط',
      'ض ص ث ق ف غ ع ه خ ح ج د',
      'ر ز و ة ى ظ ذ ء',
      'يد فم أب أم أخ عم دب لا من في هو هي قط جد سن نم قم كل خذ مع'
    ],
    w2: 'قطة أسد فيل نمر قرد بطة ديك حوت جمل سمك موز خبز تمر جبن بيض عسل لبن تين عنب شمس قمر نجم بحر نهر جبل ورد مطر نور قلم باب بيت درس أخت بنت ولد جدة كرة لون يوم رسم ' +
      '| فأر ذئب ثور أرز ماء شاي سكر ملح جزر ثلج ريح عمة خال صوت ظبي غيم',
    w3: 'أرنب نملة نحلة سمكة حصان غزال بقرة خروف حليب عصير تفاح كعكة حلوى جبنة طعام أحمر أزرق أخضر أصفر أبيض كتاب دفتر صديق معلم شجرة زهرة وردة سماء نجمة ملعب لعبة هدية ' +
      '| ضفدع ثعلب بطيخ فطور غداء عشاء أسود وردي غيمة سرير مطبخ',
    w4: 'فراشة زرافة دجاجة دلفين عصفور طاووس ليمون طماطم بطاطا سيارة طائرة حافلة دراجة مدرسة معلمة ممحاة مسطرة حقيبة حديقة مكتبة عائلة بالون نافذة صاروخ ' +
      '| سلحفاة برتقال فراولة بنفسجي برتقالي أصدقاء ببغاء ملعقة حاسوب طاولة صحراء',
    w5: 'قطة صغيرة|بيت كبير|أحب أمي|أحب أبي|كرة حمراء|قلم أزرق|أنا أقرأ|نلعب معا|الأسد قوي|وردة جميلة|القمر جميل|أنا سعيد|بطة صفراء|الفيل كبير|أرنب سريع|يوم جميل|سمكة صغيرة|شجرة عالية' +
      '||الشمس حارة اليوم|سماء زرقاء صافية|أشرب الماء كل يوم|السلحفاة بطيئة جدا|حديقة خضراء كبيرة|صديقي لطيف وذكي|نلعب الكرة معا|الطائرة في السماء',
    test: 'قطة أسد فيل نمر قرد بطة ديك حوت جمل سمك موز خبز تمر جبن بيض عسل تين عنب شمس قمر نجم بحر نهر جبل ورد مطر قلم باب بيت درس أخت بنت ولد كرة لون يوم ' +
      'أرنب نملة نحلة سمكة حصان غزال بقرة خروف حليب عصير تفاح كعكة حلوى طعام أحمر أزرق أخضر أصفر أبيض كتاب دفتر صديق معلم شجرة زهرة وردة سماء نجمة ملعب لعبة هدية ' +
      'فراشة زرافة دجاجة دلفين عصفور ليمون طماطم سيارة طائرة حافلة دراجة مدرسة حقيبة حديقة مكتبة عائلة بالون نافذة صاروخ',
    easy: 'يد فم أب أم أخ عم دب من في هو هي جد قطة أسد فيل نمر قرد بطة ديك حوت جمل سمك موز خبز تمر جبن بيض عسل تين عنب شمس قمر نجم بحر نهر جبل ورد قلم باب بيت ولد كرة يوم'
  },
  en: {
    w1: [
      'a s d f g h j k l',
      'q w e r t y u i o p',
      'z x c v b n m',
      'go up me we no on in at it is my hi do so to be he an am'
    ],
    w2: 'cat dog pig cow hen fox bee owl ant bat sun sky sea red bus car hat cap bag pen cup egg jam pie mom dad box toy bed run hop sit big hot fun ' +
      '| yak rat van mud zoo wet jet fix wax zip',
    w3: 'fish frog bird duck lion bear goat deer crab milk cake corn rice soup pear blue pink gold moon star tree rain snow wind leaf rock book ball kite doll drum bike boat ship hand foot nose jump swim sing play ' +
      '| jeep wolf yolk jazz quiz king yawn wave',
    w4: 'apple tiger zebra mouse horse panda sheep whale snake bread lemon grape melon pizza candy robot train plane truck green ' +
      '| purple yellow orange rabbit monkey turtle parrot banana cookie cherry carrot school pencil garden flower rocket castle planet rainbow',
    w5: 'a red hat|my big dog|cats can jump|we like cake|a fish can swim|the moon is big|red and blue|my pet frog|the bus is fast|pigs love mud|snow is cold|my cat naps|a happy duck|birds can fly' +
      '||the sun is hot|a big red ball|look at the sky|the tree is tall|we can play now|a cup of milk|the frog can hop|my kite is blue',
    test: 'cat dog pig cow hen fox bee owl ant bat sun sky sea red bus car hat cap bag pen cup egg jam pie box toy bed run hop sit big hot fun ' +
      'fish frog bird duck lion bear goat deer crab milk cake corn rice soup pear blue pink gold moon star tree rain snow wind leaf rock book ball kite doll drum bike boat ship hand foot nose jump swim sing play ' +
      'apple tiger zebra mouse horse panda sheep whale snake bread lemon grape melon pizza candy robot train plane truck green',
    easy: 'go up me we no on in at it is my do so to be he cat dog pig cow hen fox bee owl ant bat sun sky sea red bus car hat cap bag pen cup egg jam pie box toy bed run hop sit big hot fun'
  }
};
