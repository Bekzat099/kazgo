'use strict';

/* Редкости: обычная / сәлқән (редкая) / тарихылы (эпическая) / легендалық (легендарная) */
const RARITY = {
  common:    { name: 'ади',        color: '#9aa5b1', xp: 10,  weight: 55 },
  rare:      { name: 'сәлқән',     color: '#4dabf7', xp: 25,  weight: 25 },
  epic:      { name: 'тарихылы',   color: '#b197fc', xp: 50,  weight: 15 },
  legendary: { name: 'легендалық', color: '#fec50c', xp: 100, weight: 5  },
};

const ITEMS = [
  /* ади */
  { id:'dombyra',  name:'Домбра',               emoji:'🪕', rarity:'common',    desc:'Двухструнный инструмент — голос степи.' },
  { id:'baursak',  name:'Баурсак',              emoji:'🍩', rarity:'common',    desc:'Пожаренное в масле тесто — душа казахского стола.' },
  { id:'kymyz',    name:'Қымыз',                emoji:'🥛', rarity:'common',    desc:'Кисломолочный напиток из кобыльего молока.' },
  { id:'nan',      name:'Лепёшка',              emoji:'🍞', rarity:'common',    desc:'Горячий круглый хлеб — знак гостеприимства.' },
  { id:'shyrdak',  name:'Шырдақ',               emoji:'🧶', rarity:'common',    desc:'Ковёр из войлока, вышитый ручными узорами.' },
  { id:'shaldak',  name:'Шалдык',               emoji:'👢', rarity:'common',    desc:'Войлочные валенки — не промёрзнешь зимой.' },

  /* сәлқән */
  { id:'qobyz',    name:'Қобыз',                emoji:'🎻', rarity:'rare',      desc:'Смычковый инструмент. Звук ветра в далах.' },
  { id:'oyuorn',   name:'Ою-өрнек',             emoji:'🧿', rarity:'rare',      desc:'Национальный орнамент с тайным смыслом.' },
  { id:'qyzqumak', name:'Қызғұмақ',             emoji:'🧢', rarity:'rare',      desc:'Шапка всадника — знак молодецкой удальи.' },
  { id:'daur',     name:'Дәур',                 emoji:'🔪', rarity:'rare',      desc:'Национальный нож, передающийся от отца к сыну.' },
  { id:'bukkle',   name:'Бүккіле',              emoji:'🥁', rarity:'rare',      desc:'Бубен шамана, зовущий духов.' },

  /* тарихылы */
  { id:'shanyrak', name:'Шаңырақ',              emoji:'⭕', rarity:'epic',      desc:'Символ дома, родовой памяти и широкого неба.' },
  { id:'shashka',  name:'Шашқа',                emoji:'🗡', rarity:'epic',      desc:'Шабля батыра — хранитель чести.' },
  { id:'qaragai',  name:'Қарағай',              emoji:'🪆', rarity:'epic',      desc:'Кукла-оберег шамана, древний талисман.' },
  { id:'tunday',   name:'Тұндар',               emoji:'🪵', rarity:'epic',      desc:'Колонна юрты, опора дома.' },
  { id:'tulsi',    name:'Түлсі',                emoji:'🧥', rarity:'epic',      desc:'Тёплый овчинный халат для степи.' },

  /* легендалық */
  { id:'astana',   name:'Алтын астана',         emoji:'👑', rarity:'legendary', desc:'Древний золотой нагрудный оберег скифов.' },
  { id:'ashyq',    name:'Алтын қошқар мүйіз',   emoji:'🐏', rarity:'legendary', desc:'Золотые бараньи рога — знак силы и достатка.' },
  { id:'akyn',     name:'Домбра ақыны',         emoji:'🎶', rarity:'legendary', desc:'Домбра, на которой играл знаменитый акын.' },
];
