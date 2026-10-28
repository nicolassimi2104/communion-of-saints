/* Game content. Everything you might want to tweak (types, arenas, questions) lives here.
   No logic in this file, only data. */
(function (g) {
  var CS = (g.CS = g.CS || {});

  /* The five virtues every saint is scored on. */
  CS.VIRTUES = [
    { k: 'faith', label: 'Faith' },
    { k: 'courage', label: 'Courage' },
    { k: 'wisdom', label: 'Wisdom' },
    { k: 'charity', label: 'Charity' },
    { k: 'perseverance', label: 'Perseverance' }
  ];

  /* Saint types. Players pick a main type (and optionally a side type).
     sig     = the virtue this type guarantees a boost to when cards are dealt
     ability = the once-per-match power a saint of this MAIN type gets
     motto   = the line printed on the card (all quotes are Scripture or well attested) */
  CS.TYPES = {
    martyr: {
      label: 'Martyr', sig: 'courage',
      hint: 'Died for the faith (Stephen, Sebastian, Lawrence, Kolbe)',
      motto: 'The blood of martyrs is the seed of the Church.',
      ability: { name: 'Unflinching Witness', effect: 'boost', text: '+3 to your score this clash.' }
    },
    warrior: {
      label: 'Warrior', sig: 'courage',
      hint: 'Soldier or defender (Michael, George, Joan of Arc, Martin of Tours)',
      motto: 'Put on the whole armor of God.',
      ability: { name: 'Sword of the Spirit', effect: 'weaken', text: '-3 to your foe’s score this clash.' }
    },
    doctor: {
      label: 'Doctor', sig: 'wisdom',
      hint: 'Teacher, writer, theologian (Aquinas, Augustine, Jerome)',
      motto: 'Faith seeking understanding.',
      ability: { name: 'Sound Doctrine', effect: 'doctrine', text: 'A correct answer is worth 4 more points.' }
    },
    mystic: {
      label: 'Mystic', sig: 'faith',
      hint: 'Prayer, visions, hermits (Teresa of Ávila, Padre Pio, Anthony of Egypt)',
      motto: 'Be still, and know that I am God.',
      ability: { name: 'Rapt in Prayer', effect: 'vision', text: 'Roll three dice and keep the highest.' }
    },
    missionary: {
      label: 'Missionary', sig: 'perseverance',
      hint: 'Carried the faith to new places (Paul, Patrick, Francis Xavier)',
      motto: 'Go therefore and make disciples of all nations.',
      ability: { name: 'Go Forth', effect: 'goforth', text: 'Score with your highest virtue instead of the arena’s.' }
    },
    founder: {
      label: 'Founder', sig: 'perseverance',
      hint: 'Started an order or movement (Benedict, Dominic, Ignatius, Francis)',
      motto: 'Unless the Lord builds the house, those who build it labor in vain.',
      ability: { name: 'Rule of Life', effect: 'steady', text: 'Your die cannot roll below 5.' }
    },
    shepherd: {
      label: 'Shepherd', sig: 'wisdom',
      hint: 'Pope, bishop or priest (Peter, Leo the Great, Nicholas, John Paul II)',
      motto: 'Feed my sheep.',
      ability: { name: 'Pastoral Blessing', effect: 'blessing', text: '+1 to you and -2 to your foe.' }
    },
    servant: {
      label: 'Servant', sig: 'charity',
      hint: 'Cared for the poor and sick (Teresa of Calcutta, Vincent de Paul, Damien)',
      motto: 'Whatever you did for one of the least of these, you did for me.',
      ability: { name: 'Works of Mercy', effect: 'mercy', text: 'Cancel your foe’s arena and question bonuses.' }
    }
  };

  /* Religious orders. Choosing one gives a small guaranteed boost (ORDER_SIG in game.js) to the virtue
     the order is known for, and decides the habit your saint wears. Every order gives the same size
     of boost, so none is stronger than another. "Lay" has no fixed virtue: the player picks one.
     robe/over = habit colors; the belt and trim are drawn in avatar.js. */
  CS.ORDERS = {
    dominican:   { label: 'Dominican',   sig: 'wisdom',       robe: '#efe9d8', over: '#1c1b22',
                   hint: 'Preachers and scholars, study and truth (Aquinas, Catherine of Siena)', motto: 'Veritas.' },
    franciscan:  { label: 'Franciscan',  sig: 'charity',      robe: '#7a5230', over: '#7a5230',
                   hint: 'Poverty, joy and the poor (Francis, Clare, Anthony of Padua)', motto: 'Peace and all good.' },
    benedictine: { label: 'Benedictine', sig: 'perseverance', robe: '#24242c', over: '#34343f',
                   hint: 'Prayer and work, steady for life (Benedict, Scholastica)', motto: 'Pray and work.' },
    augustinian: { label: 'Augustinian', sig: 'charity',      robe: '#22222a', over: '#22222a',
                   hint: 'One mind and one heart (Augustine, Nicholas of Tolentino, Rita of Cascia)', motto: 'Our heart is restless until it rests in you.' },
    carmelite:   { label: 'Carmelite',   sig: 'faith',        robe: '#6b4a2b', over: '#f2ede0',
                   hint: 'Contemplative prayer (Teresa of Avila, John of the Cross, Thérèse)', motto: 'With zeal I am zealous for the Lord.' },
    jesuit:      { label: 'Jesuit',      sig: 'courage',      robe: '#1b1b22', over: '#1b1b22',
                   hint: 'Missions and learning on the frontier (Ignatius, Francis Xavier, Isaac Jogues)', motto: 'For the greater glory of God.' },
    lay:         { label: 'Lay or no order', sig: null,       robe: '#6a98f5', over: '#6a98f5',
                   hint: 'Everyone else. Pick any one virtue to lean on.', motto: '' }
  };

  /* Character builder options. Choices are stored as numbers (an index into these lists),
     so a saint's look is about 100 bytes. Looks never change strength. */
  CS.LOOK = {
    skin:  ['#f6d3b3', '#e9b98f', '#d29a6b', '#b97b4f', '#8d5a3a', '#5e3a24'],
    hairc: ['#2a1a12', '#5a3820', '#a8452a', '#c9a05a', '#9a9a9e', '#e4e0d4'],
    robe:  ['#6a98f5', '#e5566f', '#47c293', '#e2b84b', '#9b6bd6', '#e8e0cd'],
    trim:  ['#e2b84b', '#e8e0cd', '#c0392b', '#47c293'],
    hair:  ['None', 'Short', 'Long', 'Bob', 'Curly', 'Bun'],
    face:  ['Gentle', 'Joyful', 'Serene', 'Resolute'],
    head:  ['None', 'Hood', 'Veil', 'Mitre', 'Wreath', 'Cap'],
    item:  ['None', 'Book', 'Cross', 'Rosary', 'Crook', 'Lily', 'Quill', 'Sword', 'Palm'],
    halo:  ['Ring', 'Rays', 'Glow', 'None']
  };
  CS.LOOK_DEFAULT = { order: 'lay', skin: 1, face: 0, hair: 1, hairc: 1, head: 0, item: 1, halo: 0, robe: 0, trim: 0 };

  /* Arenas. Each clash happens in one. The arena sets which virtue is tested and
     which saint types are at home there (they get a bonus, see HOME_MAIN / HOME_SIDE in game.js). */
  CS.ARENAS = [
    { id: 'colosseum', name: 'The Colosseum', virtue: 'courage', favors: ['martyr', 'warrior'],
      flavor: 'Sand, crowds, and nowhere to run.' },
    { id: 'walls', name: 'The Walls of the City', virtue: 'courage', favors: ['warrior', 'shepherd'],
      flavor: 'Someone has to stand between the flock and the wolves.' },
    { id: 'scriptorium', name: 'The Scriptorium', virtue: 'wisdom', favors: ['doctor', 'founder'],
      flavor: 'Ink, parchment, and a very long argument.' },
    { id: 'council', name: 'The Council Hall', virtue: 'wisdom', favors: ['doctor', 'shepherd'],
      flavor: 'Bishops gathered, creeds debated, nobody leaves early.' },
    { id: 'hospice', name: 'The Hospice', virtue: 'charity', favors: ['servant', 'founder'],
      flavor: 'Quiet rooms, the sick, and the work of mercy.' },
    { id: 'road', name: 'The Mission Road', virtue: 'charity', favors: ['servant', 'missionary'],
      flavor: 'A long road, a small bag, and a people who have never heard.' },
    { id: 'desert', name: 'The Desert', virtue: 'perseverance', favors: ['martyr', 'mystic'],
      flavor: 'Heat by day, cold by night, and only prayer for company.' },
    { id: 'upper', name: 'The Upper Room', virtue: 'faith', favors: ['mystic', 'missionary'],
      flavor: 'Doors locked, hearts waiting, and then a rushing wind.' }
  ];

  /* How hard a question is decides how many points a correct answer adds to the clash.
     Later rounds and deciding clashes lean toward harder questions (see startClash in game.js). */
  CS.DIFFICULTY = {
    1: { label: 'Easy', bonus: 3 },
    2: { label: 'Medium', bonus: 5 },
    3: { label: 'Hard', bonus: 7 }
  };

  /* Trivia. The FIRST option is always the correct one; the order is shuffled in play.
     q = question, o = [correct, wrong, wrong, wrong], n = note shown after the reveal,
     d = difficulty 1 (easy), 2 (medium) or 3 (hard). Leave d off and it counts as easy. */
  CS.QUESTIONS = [
    { q: 'Who was the first Christian martyr?', o: ['Stephen', 'James the Greater', 'Peter', 'Paul'], n: 'Stephen was stoned in Acts 7, with Saul looking on.', d: 1 },
    { q: 'Which Apostle was a tax collector before Jesus called him?', o: ['Matthew', 'Andrew', 'Thomas', 'Philip'], n: 'Matthew, also called Levi (Mt 9:9).', d: 1 },
    { q: 'Jesus renames Simon "Peter." What does the name mean?', o: ['Rock', 'Shepherd', 'Fisherman', 'Faithful'], n: 'Petros and Cephas both mean rock (Mt 16:18).', d: 1 },
    { q: 'Which saint wrote the Summa Theologiae?', o: ['Thomas Aquinas', 'Augustine', 'Bonaventure', 'Anselm'], n: 'Aquinas, the Angelic Doctor.', d: 2 },
    { q: 'Who founded the Society of Jesus, the Jesuits?', o: ['Ignatius of Loyola', 'Francis Xavier', 'Dominic', 'Philip Neri'], n: 'Ignatius, approved by Pope Paul III in 1540.', d: 2 },
    { q: 'On what date do we celebrate All Saints’ Day?', o: ['November 1', 'October 31', 'November 2', 'December 8'], n: 'All Souls’ Day follows on November 2.', d: 1 },
    { q: 'What does the bishop use to anoint a person in Confirmation?', o: ['Sacred chrism', 'Holy water', 'Oil of the sick', 'Blessed ashes'], n: 'Chrism, blessed at the Chrism Mass.', d: 1 },
    { q: 'Which Franciscan priest volunteered to die in another prisoner’s place at Auschwitz?', o: ['Maximilian Kolbe', 'Padre Pio', 'Anthony of Padua', 'Bonaventure'], n: 'Kolbe, in 1941.', d: 2 },
    { q: 'Who was beheaded in 1535 for refusing to accept Henry VIII as head of the Church in England?', o: ['Thomas More', 'Thomas Becket', 'Thomas Aquinas', 'Thomas Cranmer'], n: 'More: "the king’s good servant, but God’s first."', d: 2 },
    { q: 'Where was Saul when the risen Jesus appeared to him?', o: ['On the road to Damascus', 'In Jerusalem', 'In Antioch', 'In Tarsus'], n: 'Acts 9.', d: 1 },
    { q: 'Which saint is credited with the first live Nativity scene, at Greccio in 1223?', o: ['Francis of Assisi', 'Anthony of Padua', 'Nicholas', 'Benedict'], n: 'Francis, three years before his death.', d: 2 },
    { q: '"Our heart is restless until it rests in you" opens which saint’s Confessions?', o: ['Augustine', 'Jerome', 'Ambrose', 'Gregory the Great'], n: 'Augustine of Hippo.', d: 2 },
    { q: 'How many gifts of the Holy Spirit does the Church traditionally list (Isaiah 11)?', o: ['Seven', 'Three', 'Nine', 'Twelve'], n: 'Wisdom, understanding, counsel, fortitude, knowledge, piety, fear of the Lord.', d: 2 },
    { q: 'Which archangel announced to Mary that she would conceive the Son of God?', o: ['Gabriel', 'Michael', 'Raphael', 'Uriel'], n: 'Luke 1:26-38.', d: 1 },
    { q: 'Joan of Arc led armies in defense of which country?', o: ['France', 'England', 'Spain', 'Italy'], n: 'France, during the Hundred Years’ War.', d: 1 },
    { q: 'Paul’s "Love is patient, love is kind" passage is in his first letter to which city?', o: ['Corinth', 'Ephesus', 'Rome', 'Philippi'], n: '1 Corinthians 13.', d: 2 },
    { q: 'Which saint is traditionally said to have used the shamrock to teach about the Trinity?', o: ['Patrick', 'Columba', 'Brendan', 'Brigid'], n: 'Patrick, Apostle of Ireland.', d: 1 },
    { q: '"Pray and work" sums up the Rule of which saint?', o: ['Benedict', 'Bruno', 'Basil', 'Bernard'], n: 'Benedict of Nursia.', d: 2 },
    { q: 'Which saint is said to be the first to receive the stigmata, on Mount La Verna in 1224?', o: ['Francis of Assisi', 'Padre Pio', 'Catherine of Siena', 'Clare'], n: 'Francis of Assisi.', d: 2 },
    { q: 'Which teenager, canonized in 2025, built a website cataloguing Eucharistic miracles?', o: ['Carlo Acutis', 'Pier Giorgio Frassati', 'Dominic Savio', 'Tarcisius'], n: 'Carlo Acutis, canonized September 7, 2025.', d: 2 },
    { q: 'Which Gospel is traditionally the shortest?', o: ['Mark', 'Matthew', 'Luke', 'John'], n: 'Mark has 16 chapters.', d: 2 },
    { q: 'Which Apostle was Peter’s brother?', o: ['Andrew', 'John', 'Philip', 'Bartholomew'], n: 'Andrew, the first-called.', d: 1 },
    { q: 'Which saint is known as "The Little Flower"?', o: ['Thérèse of Lisieux', 'Teresa of Ávila', 'Faustina', 'Bernadette'], n: 'Thérèse, who taught the "little way."', d: 2 },
    { q: 'Which council of 325 first produced the Nicene Creed?', o: ['Nicaea', 'Chalcedon', 'Trent', 'Ephesus'], n: 'The First Council of Nicaea.', d: 3 },
    { q: 'Which saint translated most of the Bible into Latin, the Vulgate?', o: ['Jerome', 'Ambrose', 'Augustine', 'Gregory'], n: 'Jerome, from his cell in Bethlehem.', d: 2 },
    { q: 'The Beatitudes open which sermon of Jesus?', o: ['The Sermon on the Mount', 'The Last Discourse', 'The Bread of Life Discourse', 'The Olivet Discourse'], n: 'Matthew 5.', d: 2 },
    { q: 'Which saint founded the Missionaries of Charity in Calcutta?', o: ['Teresa of Calcutta', 'Katharine Drexel', 'Elizabeth Ann Seton', 'Frances Cabrini'], n: 'Founded in 1950.', d: 1 },
    { q: 'Who was elected pope in 1978 as the first non-Italian pope in over four centuries?', o: ['John Paul II', 'Paul VI', 'John Paul I', 'Benedict XVI'], n: 'Karol Wojtyła of Poland.', d: 2 },
    { q: 'In which Gospel does the parable of the Prodigal Son appear?', o: ['Luke', 'Matthew', 'Mark', 'John'], n: 'Luke 15.', d: 2 },
    { q: 'On what date is the feast of Saint Joseph, husband of Mary?', o: ['March 19', 'March 17', 'May 1', 'December 26'], n: 'March 19. Patrick is March 17.', d: 3 },
    { q: 'Which council, in 431, declared Mary Theotokos ("God-bearer")?', o: ['Ephesus', 'Nicaea', 'Chalcedon', 'Constantinople I'], n: 'The Council of Ephesus, which rejected Nestorius.', d: 3 },
    { q: 'Which saint wrote The Interior Castle, comparing the soul to a castle of seven mansions?', o: ['Teresa of Ávila', 'John of the Cross', 'Catherine of Siena', 'Francis de Sales'], n: 'Teresa wrote it in 1577.', d: 3 },
    { q: 'Which Dominican tertiary pressed Pope Gregory XI to return the papacy from Avignon to Rome?', o: ['Catherine of Siena', 'Bridget of Sweden', 'Teresa of Ávila', 'Hildegard of Bingen'], n: 'Gregory XI returned to Rome in 1377.', d: 3 },
    { q: 'Which bishop of Milan baptized Augustine in 387?', o: ['Ambrose', 'Jerome', 'Gregory the Great', 'Hilary of Poitiers'], n: 'Ambrose, whose preaching had moved Augustine.', d: 3 },
    { q: 'Who was chosen by lot to take the place of Judas among the Twelve?', o: ['Matthias', 'Barnabas', 'Silas', 'Bartholomew'], n: 'Acts 1:23-26.', d: 3 },
    { q: 'Which council defined papal infallibility in 1870?', o: ['First Vatican Council', 'Council of Trent', 'Second Vatican Council', 'Fourth Lateran Council'], n: 'Vatican I, under Pius IX.', d: 3 },
    { q: 'Which pope convened the Council of Trent in 1545?', o: ['Paul III', 'Pius V', 'Julius II', 'Leo X'], n: 'Paul III also approved the Jesuits in 1540.', d: 3 },
    { q: 'Which bishop of Antioch wrote seven letters on his way to martyrdom in Rome, around AD 107?', o: ['Ignatius', 'Polycarp', 'Clement of Rome', 'Justin Martyr'], n: 'He was martyred in the Colosseum, torn apart by wild beasts.', d: 3 },
    { q: 'The Council of Nicaea condemned which teaching, that the Son is a creature and not fully divine?', o: ['Arianism', 'Pelagianism', 'Donatism', 'Nestorianism'], n: 'Named for the priest Arius. Nicaea answered with "consubstantial with the Father."', d: 3 },
    { q: 'Which pope is traditionally said to have persuaded Attila the Hun to turn back from Rome in 452?', o: ['Leo the Great', 'Gregory the Great', 'Gelasius I', 'Sylvester I'], n: 'Leo I, who also shaped the Council of Chalcedon.', d: 3 }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = CS;
})(typeof window !== 'undefined' ? window : globalThis);
