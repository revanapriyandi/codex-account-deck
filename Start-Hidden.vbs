Option Explicit
Dim shell, command, i
Set shell = CreateObject("WScript.Shell")
command = ""
For i = 0 To WScript.Arguments.Count - 1
 If i > 0 Then command = command & " "
 command = command & Chr(34) & Replace(WScript.Arguments(i), Chr(34), Chr(34) & Chr(34)) & Chr(34)
Next
shell.Run command, 0, False
