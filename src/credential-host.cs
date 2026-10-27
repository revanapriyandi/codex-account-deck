using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
internal static class CredentialHost {
 private static int Main(string[] args) {
  byte[] input=null,output=null;
  try {
   if(args.Length!=1 || (args[0]!="Protect"&&args[0]!="Unprotect")) return 2;
   input=Convert.FromBase64String(Console.In.ReadToEnd().Trim());
   byte[] entropy=Encoding.UTF8.GetBytes("codex-account-switcher-local:v1");
   output=args[0]=="Protect"?ProtectedData.Protect(input,entropy,DataProtectionScope.CurrentUser):ProtectedData.Unprotect(input,entropy,DataProtectionScope.CurrentUser);
   Console.Out.Write(Convert.ToBase64String(output));
   return 0;
  } catch { Console.Error.Write("Credential protection failed");return 1; }
  finally { if(input!=null)Array.Clear(input,0,input.Length);if(output!=null)Array.Clear(output,0,output.Length); }
 }
}
