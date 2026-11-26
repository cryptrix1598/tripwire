/**
 * Common given names, used by the regex redactor to catch a person's name in
 * ordinary prose ("I spoke to Margaret Ellison yesterday") when there is no
 * on-device model to do it. Deliberately leaves out names that are also
 * everyday words, places or company names (Will, Mark, Rose, Chase, Austin,
 * Stanley...), because mangling those would cost more than it protects.
 *
 * English, Spanish and French names are listed, with and without accents, because
 * people often type them either way. Names that begin or end with an accented
 * letter (Élodie, Hervé) are left to the on-device model: the pattern's word
 * boundaries only work on plain letters.
 *
 * This is a safety net, not a guarantee: an unusual name with no greeting,
 * title or label in front of it can still get through on a computer without
 * on-device AI. The interface says "the personal details it could recognise"
 * for exactly that reason.
 */
export const GIVEN_NAMES: ReadonlySet<string> = new Set(
  `james john robert michael william david richard joseph thomas christopher daniel matthew anthony donald steven paul andrew
  joshua kenneth kevin brian george edward ronald timothy jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin
  scott brandon benjamin samuel gregory alexander patrick raymond jack dennis jerry tyler aaron jose adam henry nathan douglas
  zachary peter kyle walter ethan jeremy harold keith roger noah gerald carl terry sean arthur lawrence jesse dylan bryan joe billy
  bruce albert willie gabriel alan juan wayne roy ralph randy eugene vincent russell elijah louis bobby philip johnny howard leonard
  norman ernest alfred clarence frederick harry edwin martin derek graham nigel trevor colin ian malcolm neil stuart clive gordon
  barry geoffrey reginald cyril sidney charles
  mary patricia jennifer linda elizabeth barbara susan jessica sarah karen nancy lisa betty margaret sandra ashley kimberly emily
  donna michelle dorothy carol amanda melissa deborah stephanie rebecca sharon laura cynthia kathleen amy shirley angela helen anna
  brenda pamela nicole emma samantha katherine christine debra rachel catherine carolyn janet ruth maria heather diane julie joyce
  olivia kelly christina lauren joan evelyn judith megan cheryl andrea hannah martha jacqueline frances gloria ann teresa kathryn
  sara janice alice doris abigail julia judy beverly denise marilyn danielle theresa sophia marie diana brittany natalie isabella
  kayla alexis lori mildred irene gladys edna ethel lillian eleanor norma phyllis lois pauline bernice josephine marjorie geraldine
  agnes wanda connie peggy sheila rita maureen eileen doreen vera edith hazel muriel winifred
  alejandro alberto alfonso antonio carlos diego eduardo enrique esteban fernando francisco gonzalo guillermo gustavo ignacio
  javier jorge luis manuel marcos miguel pablo pedro rafael ramon ramón ricardo roberto rodrigo sergio andres andrés agustin
  agustín hector héctor jaime octavio osvaldo rogelio nicolas nicolás
  alejandra alicia beatriz carmen catalina cristina elena guadalupe isabel juana leticia lorena lucia lucía mariana marta monica
  mónica natalia raquel rocio rocío silvia sofia sofía susana veronica verónica ximena yolanda adriana fabiola graciela ines inés
  josefina lupita maribel valentina
  antoine bernard christophe didier fabrice francois françois frederic frédéric gerard gérard jacques jean jerome jérôme julien
  laurent lucien marcel mathieu olivier philippe sebastien sébastien stephane stéphane thierry yves
  amelie amélie anais anaïs aurelie aurélie brigitte camille celine céline chantal delphine dominique francoise françoise
  genevieve geneviève helene hélène isabelle madeleine manon michele michèle monique nathalie odile simone solange sylvie
  valerie valérie veronique véronique yvonne ginette josette colette mireille huguette`.split(/\s+/),
);

/** Companies whose names start with a given name. Kept readable: who is being imitated matters to the check. */
export const NAME_LIKE_BRANDS: ReadonlySet<string> = new Set([
  'charles schwab',
  'edward jones',
  'raymond james',
  'john deere',
  'john lewis',
  'john hancock',
  'ralph lauren',
  'martin lewis',
  'jack daniel',
  'mary kay',
  'laura ashley',
  'betty crocker',
  'sara lee',
  'sarah lawrence',
  'william hill',
  'thomas cook',
  'peter pan',
  'george washington',
]);
