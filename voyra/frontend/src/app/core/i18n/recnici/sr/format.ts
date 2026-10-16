export const format = {
  dani: ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'].join('|'),
  meseci: [
    'januar', 'februar', 'mart', 'april', 'maj', 'jun',
    'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'
  ].join('|'),
  datumSaDanom: '{dan}, {broj}. {mesec}',
  direktanLet: 'direktan let',
  presedanje: { jedan: '{broj} presedanje', nekoliko: '{broj} presedanja', mnogo: '{broj} presedanja' },
  pesice: 'pešice',
  prevozom: 'prevozom'
};
