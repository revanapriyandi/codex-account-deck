$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SwitcherPackageIdentity {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern int GetCurrentPackageFullName(ref uint length,StringBuilder value);
 public static string Read(){uint length=0;int status=GetCurrentPackageFullName(ref length,null);if(status!=122)return "";var value=new StringBuilder((int)length);return GetCurrentPackageFullName(ref length,value)==0?value.ToString():"";}
}
'@
[Console]::Out.Write([SwitcherPackageIdentity]::Read())
