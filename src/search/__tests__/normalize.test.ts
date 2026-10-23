import { ftsQuery, normalizeText, searchTokens } from '../normalize';

describe('normalizeText', () => {
  it('strips Greek tonos and dialytika and lowercases', () => {
    expect(normalizeText('Χατζιδάκις')).toBe('χατζιδακισ');
    expect(normalizeText('ΑΓΆΠΗ')).toBe('αγαπη');
    expect(normalizeText('Ϊνδαλμα ΰ ΐ')).toBe('ινδαλμα υ ι');
  });

  it('treats final sigma as sigma', () => {
    expect(normalizeText('Έρως')).toBe('ερωσ');
    expect(normalizeText('ΕΡΩΣ')).toBe(normalizeText('έρως'));
  });

  it('strips Latin and other combining marks', () => {
    expect(normalizeText('Beyoncé')).toBe('beyonce');
    expect(normalizeText('Mötley Crüe')).toBe('motley crue');
    expect(normalizeText('Ñandú Ångström')).toBe('nandu angstrom');
  });

  it('collapses and trims whitespace', () => {
    expect(normalizeText('  Μάνος \t  Χατζιδάκις \n')).toBe('μανοσ χατζιδακισ');
  });
});

describe('searchTokens / ftsQuery', () => {
  it('splits on anything that is not a letter or digit, like the FTS tokenizer', () => {
    expect(searchTokens('a-ha "Take On" Me!')).toEqual(['a', 'ha', 'take', 'on', 'me']);
  });

  it('builds a prefix query per token and never lets FTS syntax through', () => {
    expect(ftsQuery('Χατζιδ μάνο')).toBe('"χατζιδ"* "μανο"*');
    expect(ftsQuery('NEAR(" OR *')).toBe('"near"* "or"*');
  });

  it('returns null when nothing is searchable', () => {
    expect(ftsQuery('  "*-  ')).toBeNull();
  });
});
