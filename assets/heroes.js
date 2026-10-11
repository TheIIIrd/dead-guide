/* Registry of all dossiers. The case menu on every hero page and the catalog on the main page are built from it.
   To add a hero: create a folder with index.html and hero.js, then add one entry here. Paths are relative to the site root. */
window.DOSSIERS = [
  {
    id: 'abrams', name: 'Abrams', num: '0800', path: 'abrams/index.html',
    role: 'Танк ближнего боя', style: 'В гущу драки, урон от способностей', cx: 1,
    charge: 'Обвиняется в том, что всегда первым лезет в драку.',
    folder: '#b89a5e', ink: '#221d16'
  },
  {
    id: 'paradox', name: 'Paradox', num: '0730', path: 'paradox/index.html',
    role: 'Маг дальнего боя', style: 'Издалека, контроль и урон способностями', cx: 3,
    charge: 'Обвиняется в том, что меняет людей местами без их согласия.',
    folder: '#8fa3b8', ink: '#141b24'
  }
];
