package app.tripwire.guardian.check

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases as the extension (corpus/redaction-fixtures.json), so the two redactors cannot drift apart. */
class RedactionFixturesTest {
    @Test
    fun `every shared case passes on Android too`() {
        val json = File("../../corpus/redaction-fixtures.json").readText()
        val cases = Regex("""\{\s*"id":\s*"([^"]+)",\s*"text":\s*"((?:[^"\\]|\\.)*)",\s*"remove":\s*\[([^\]]*)],\s*"keep":\s*\[([^\]]*)]""").findAll(json).toList()
        assertTrue("no cases read", cases.size >= 5)
        fun list(s: String) = Regex(""""((?:[^"\\]|\\.)*)"""").findAll(s).map { it.groupValues[1] }.toList()
        for (c in cases) {
            val (id, raw, remove, keep) = c.destructured
            val text = raw.replace("\\n", "\n").replace("\\\"", "\"")
            val out = Redactor.redact(text).text
            list(remove).forEach { assertFalse("$id: $it leaked in $out", out.contains(it)) }
            list(keep).forEach { assertTrue("$id: $it was removed in $out", out.contains(it)) }
        }
    }
}
