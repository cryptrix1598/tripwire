package app.tripwire.guardian.check

/**
 * Common given names, the same list as the extension (src/redaction/names.ts), generated from it.
 * Used to catch a name in ordinary prose when no model is there to do it. A safety net, not a guarantee.
 */
object Names {
    val GIVEN: Set<String> = setOf(
        "james", "john", "robert", "michael", "william", "david", "richard", "joseph", "thomas", "christopher", "daniel", "matthew",
        "anthony", "donald", "steven", "paul", "andrew", "joshua", "kenneth", "kevin", "brian", "george", "edward", "ronald",
        "timothy", "jason", "jeffrey", "ryan", "jacob", "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin",
        "scott", "brandon", "benjamin", "samuel", "gregory", "alexander", "patrick", "raymond", "jack", "dennis", "jerry", "tyler",
        "aaron", "jose", "adam", "henry", "nathan", "douglas", "zachary", "peter", "kyle", "walter", "ethan", "jeremy",
        "harold", "keith", "roger", "noah", "gerald", "carl", "terry", "sean", "arthur", "lawrence", "jesse", "dylan",
        "bryan", "joe", "billy", "bruce", "albert", "willie", "gabriel", "alan", "juan", "wayne", "roy", "ralph",
        "randy", "eugene", "vincent", "russell", "elijah", "louis", "bobby", "philip", "johnny", "howard", "leonard", "norman",
        "ernest", "alfred", "clarence", "frederick", "harry", "edwin", "martin", "derek", "graham", "nigel", "trevor", "colin",
        "ian", "malcolm", "neil", "stuart", "clive", "gordon", "barry", "geoffrey", "reginald", "cyril", "sidney", "charles",
        "mary", "patricia", "jennifer", "linda", "elizabeth", "barbara", "susan", "jessica", "sarah", "karen", "nancy", "lisa",
        "betty", "margaret", "sandra", "ashley", "kimberly", "emily", "donna", "michelle", "dorothy", "carol", "amanda", "melissa",
        "deborah", "stephanie", "rebecca", "sharon", "laura", "cynthia", "kathleen", "amy", "shirley", "angela", "helen", "anna",
        "brenda", "pamela", "nicole", "emma", "samantha", "katherine", "christine", "debra", "rachel", "catherine", "carolyn", "janet",
        "ruth", "maria", "heather", "diane", "julie", "joyce", "olivia", "kelly", "christina", "lauren", "joan", "evelyn",
        "judith", "megan", "cheryl", "andrea", "hannah", "martha", "jacqueline", "frances", "gloria", "ann", "teresa", "kathryn",
        "sara", "janice", "alice", "doris", "abigail", "julia", "judy", "beverly", "denise", "marilyn", "danielle", "theresa",
        "sophia", "marie", "diana", "brittany", "natalie", "isabella", "kayla", "alexis", "lori", "mildred", "irene", "gladys",
        "edna", "ethel", "lillian", "eleanor", "norma", "phyllis", "lois", "pauline", "bernice", "josephine", "marjorie", "geraldine",
        "agnes", "wanda", "connie", "peggy", "sheila", "rita", "maureen", "eileen", "doreen", "vera", "edith", "hazel",
        "muriel", "winifred", "alejandro", "alberto", "alfonso", "antonio", "carlos", "diego", "eduardo", "enrique", "esteban", "fernando",
        "francisco", "gonzalo", "guillermo", "gustavo", "ignacio", "javier", "jorge", "luis", "manuel", "marcos", "miguel", "pablo",
        "pedro", "rafael", "ramon", "ramón", "ricardo", "roberto", "rodrigo", "sergio", "andres", "andrés", "agustin", "agustín",
        "hector", "héctor", "jaime", "octavio", "osvaldo", "rogelio", "nicolas", "nicolás", "alejandra", "alicia", "beatriz", "carmen",
        "catalina", "cristina", "elena", "guadalupe", "isabel", "juana", "leticia", "lorena", "lucia", "lucía", "mariana", "marta",
        "monica", "mónica", "natalia", "raquel", "rocio", "rocío", "silvia", "sofia", "sofía", "susana", "veronica", "verónica",
        "ximena", "yolanda", "adriana", "fabiola", "graciela", "ines", "inés", "josefina", "lupita", "maribel", "valentina", "antoine",
        "bernard", "christophe", "didier", "fabrice", "francois", "françois", "frederic", "frédéric", "gerard", "gérard", "jacques", "jean",
        "jerome", "jérôme", "julien", "laurent", "lucien", "marcel", "mathieu", "olivier", "philippe", "sebastien", "sébastien", "stephane",
        "stéphane", "thierry", "yves", "amelie", "amélie", "anais", "anaïs", "aurelie", "aurélie", "brigitte", "camille", "celine",
        "céline", "chantal", "delphine", "dominique", "francoise", "françoise", "genevieve", "geneviève", "helene", "hélène", "isabelle", "madeleine",
        "manon", "michele", "michèle", "monique", "nathalie", "odile", "simone", "solange", "sylvie", "valerie", "valérie", "veronique",
        "véronique", "yvonne", "ginette", "josette", "colette", "mireille", "huguette",
    )

    /** Companies whose names start with a given name: who is being imitated matters to the check. */
    val BRANDS: Set<String> = setOf(
        "charles schwab", "edward jones", "raymond james", "john deere", "john lewis", "john hancock", "ralph lauren", "martin lewis", "jack daniel", "mary kay", "laura ashley", "betty crocker",
        "sara lee", "sarah lawrence", "william hill", "thomas cook", "peter pan", "george washington",
    )
}
