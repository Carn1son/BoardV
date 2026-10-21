// Settings from the earlier Electron build: its page kept them in Chromium's localStorage (LevelDB under
// %APPDATA%\Boardview Reader). The recent writes sit in the LevelDB log files; they are read once and handed to the page.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace BoardV
{
    static class Migrate
    {
        public static Dictionary<string, string> OldSettings()
        {
            var found = new Dictionary<string, string>();
            try
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Boardview Reader", "Local Storage", "leveldb");
                if (!Directory.Exists(dir)) return found;
                // oldest log first, so later writes win
                foreach (var f in Directory.GetFiles(dir, "*.log").OrderBy(p => File.GetLastWriteTimeUtc(p)))
                {
                    byte[] data;
                    using (var fs = new FileStream(f, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) { data = new byte[fs.Length]; fs.Read(data, 0, data.Length); }
                    foreach (var rec in Records(data)) Batch(rec, found);
                }
            }
            catch { }
            return found;
        }

        // LevelDB log: 32 KB blocks of chunks [crc 4][len 2][type 1][data]; type 1 full, 2 first, 3 middle, 4 last
        static IEnumerable<byte[]> Records(byte[] d)
        {
            const int Block = 32768; var cur = new MemoryStream(); int p = 0;
            while (p + 7 <= d.Length)
            {
                int left = Block - p % Block;
                if (left < 7) { p += left; continue; }
                int len = d[p + 4] | (d[p + 5] << 8), type = d[p + 6];
                if (type == 0 && len == 0) { p += left; continue; }
                if (p + 7 + len > d.Length) yield break;
                if (type == 1) { var b = new byte[len]; Buffer.BlockCopy(d, p + 7, b, 0, len); yield return b; cur.SetLength(0); }
                else if (type == 2) { cur.SetLength(0); cur.Write(d, p + 7, len); }
                else if (type == 3) cur.Write(d, p + 7, len);
                else if (type == 4) { cur.Write(d, p + 7, len); yield return cur.ToArray(); cur.SetLength(0); }
                p += 7 + len;
            }
        }

        static bool Varint(byte[] b, ref int p, out int v)
        {
            v = 0; int shift = 0;
            while (p < b.Length && shift < 35) { int c = b[p++]; v |= (c & 0x7f) << shift; if ((c & 0x80) == 0) return true; shift += 7; }
            return false;
        }

        // WriteBatch: [seq 8][count 4] then entries: [tag 1][key][value] (tag 1 = put, 0 = delete), lengths as varints
        static void Batch(byte[] b, Dictionary<string, string> o)
        {
            if (b.Length < 12) return;
            int p = 12;
            while (p < b.Length)
            {
                int tag = b[p++], kl, vl;
                if (!Varint(b, ref p, out kl) || p + kl > b.Length) return;
                string key = Key(b, p, kl); p += kl;
                if (tag == 1)
                {
                    if (!Varint(b, ref p, out vl) || p + vl > b.Length) return;
                    if (key != null) o[key] = Value(b, p, vl);
                    p += vl;
                }
                else if (tag == 0) { if (key != null) o.Remove(key); }
                else return;
            }
        }

        // keys look like "_file://\0\x01bvr-config": the origin, a zero, then a one-byte encoding mark and the key
        static string Key(byte[] b, int p, int n)
        {
            const string pre = "_file://";
            if (n < pre.Length + 3) return null;
            for (int i = 0; i < pre.Length; i++) if (b[p + i] != pre[i]) return null;
            int k = p + pre.Length; if (b[k] != 0) return null;
            int enc = b[k + 1], s = k + 2, len = p + n - s;
            return enc == 0 ? Encoding.Unicode.GetString(b, s, len) : Encoding.GetEncoding(28591).GetString(b, s, len);
        }

        static string Value(byte[] b, int p, int n)
        {
            if (n < 1) return "";
            return b[p] == 0 ? Encoding.Unicode.GetString(b, p + 1, n - 1) : Encoding.GetEncoding(28591).GetString(b, p + 1, n - 1);
        }
    }
}
