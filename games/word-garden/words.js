/*
 * حديقة الكلمات (Word Garden) — the words.
 * Simple nouns a child knows and can see in a picture (art.js draws every picture id),
 * in plain letters: no tashkeel, no tatweel, no names of people. Each language has five
 * worlds; a world is 'easier words || harder words' (the DDA tier and the level decide
 * how many harder ones a level mixes in). An entry is 'text=picture' and a picture can
 * carry one change: .r red .g green .b blue .w white (colour), .s small, .B big, .t tall.
 *   w1 animals    w2 food    w3 home and school    w4 outside    w5 two words together
 * tools/tests/word-garden-engine.test.mjs checks that every letter is on the school
 * keyboard, no text repeats, every picture exists and each world keeps to its theme.
 */
window.WG_WORDS = {
  // Which pictures belong to which theme (the phrases may use any picture).
  themes: {
    animals: 'cat dog duck lion elephant fish rabbit horse cow sheep hen bee butterfly frog monkey bear owl turtle mouse whale camel',
    food: 'apple banana orange grapes strawberry watermelon lemon carrot tomato cherry pear corn bread cheese milk egg cake candy pizza',
    home: 'book pencil door chair bed clock cup ball house hat gift table key lamp bag umbrella window spoon shoe',
    outside: 'sun moon star tree flower cloud rain snow leaf car bus train boat plane bike rocket balloon waterfall'
  },
  worldThemes: ['animals', 'food', 'home', 'outside', ''],
  ar: [
    'قطة=cat | كلب=dog | بطة=duck | أسد=lion | فيل=elephant | سمكة=fish | دب=bear | قرد=monkey | بقرة=cow | نحلة=bee | بومة=owl | فأر=mouse | جمل=camel | حوت=whale' +
      ' || أرنب=rabbit | حصان=horse | خروف=sheep | دجاجة=hen | فراشة=butterfly | ضفدع=frog | سلحفاة=turtle',
    'موزة=banana | عنب=grapes | تفاحة=apple | جزرة=carrot | ليمونة=lemon | كرز=cherry | خبز=bread | جبنة=cheese | حليب=milk | بيضة=egg | كعكة=cake | ذرة=corn' +
      ' || برتقالة=orange | فراولة=strawberry | بطيخة=watermelon | طماطم=tomato | كمثرى=pear | حلوى=candy | بيتزا=pizza',
    'كتاب=book | قلم=pencil | باب=door | كرسي=chair | سرير=bed | ساعة=clock | كوب=cup | كرة=ball | بيت=house | قبعة=hat | هدية=gift' +
      ' || طاولة=table | مفتاح=key | مصباح=lamp | حقيبة=bag | مظلة=umbrella | نافذة=window | ملعقة=spoon | حذاء=shoe',
    'شمس=sun | قمر=moon | مطر=rain | ثلج=snow | نجمة=star | شجرة=tree | زهرة=flower | غيمة=cloud | ورقة=leaf | قطار=train | قارب=boat' +
      ' || بالون=balloon | سيارة=car | حافلة=bus | طائرة=plane | دراجة=bike | صاروخ=rocket | شلال=waterfall',
    'كرة حمراء=ball.r | قطة بيضاء=cat.w | شمس صفراء=sun | سمكة صغيرة=fish.s | فيل كبير=elephant.B | بيت كبير=house.B | كلب صغير=dog.s | بطة صفراء=duck | وردة حمراء=flower.r | تفاحة خضراء=apple.g | قلم أزرق=pencil.b | سيارة زرقاء=car.b' +
      ' || بالون أحمر=balloon.r | نجمة لامعة=star | شجرة عالية=tree.t | أرنب أبيض=rabbit.w | موزة صفراء=banana | كعكة لذيذة=cake | سمكة زرقاء=fish.b | قمر جميل=moon | قبعة خضراء=hat.g'
  ],
  en: [
    'cat=cat | dog=dog | cow=cow | hen=hen | bee=bee | owl=owl | duck=duck | fish=fish | frog=frog | lion=lion | bear=bear | mouse=mouse' +
      ' || sheep=sheep | horse=horse | whale=whale | camel=camel | rabbit=rabbit | monkey=monkey | turtle=turtle | elephant=elephant | butterfly=butterfly',
    'egg=egg | cake=cake | milk=milk | corn=corn | pear=pear | lemon=lemon | apple=apple | bread=bread | candy=candy | pizza=pizza | grapes=grapes' +
      ' || banana=banana | orange=orange | cherry=cherry | carrot=carrot | tomato=tomato | cheese=cheese | strawberry=strawberry | watermelon=watermelon',
    'bed=bed | cup=cup | hat=hat | key=key | bag=bag | book=book | ball=ball | door=door | lamp=lamp | shoe=shoe | gift=gift' +
      ' || chair=chair | table=table | clock=clock | house=house | spoon=spoon | pencil=pencil | window=window | umbrella=umbrella',
    'sun=sun | car=car | bus=bus | moon=moon | star=star | tree=tree | rain=rain | snow=snow | leaf=leaf | boat=boat | bike=bike' +
      ' || cloud=cloud | train=train | plane=plane | flower=flower | rocket=rocket | balloon=balloon | waterfall=waterfall',
    'red ball=ball.r | white cat=cat.w | yellow sun=sun | small fish=fish.s | big lion=lion.B | big house=house.B | small dog=dog.s | yellow duck=duck | red flower=flower.r | green apple=apple.g | blue car=car.b' +
      ' || red balloon=balloon.r | shiny star=star | tall tree=tree.t | white rabbit=rabbit.w | yellow banana=banana | big elephant=elephant.B | blue fish=fish.b | green hat=hat.g | tasty cake=cake'
  ]
};
