import type { GuideCommand } from "../contract";

/**
 * Independently reviewed command records for the GUIDE-02 draft. The guide is
 * not a published Guide record: a named human still needs to approve it.
 */
export const nodeWindowsVerificationCommands: GuideCommand[] = [
  {
    command: "node --version",
    operatingSystem: "Windows 10 or Windows 11",
    shell: "PowerShell or Command Prompt",
    workingDirectory: "Any directory; it does not depend on a project folder.",
    requiresAdministrator: false,
    writesOrDeletes: false,
    opensNetworkPort: false,
    downloadsExecutableCode: false,
    variablesToReplace: [],
    expectedOutput: "A Node.js version beginning with v, for example v24.18.0.",
    rollback: "None; this command only prints the installed version.",
  },
  {
    command: "npm.cmd --version",
    operatingSystem: "Windows 10 or Windows 11",
    shell: "PowerShell or Command Prompt",
    workingDirectory: "Any directory; it does not depend on a project folder.",
    requiresAdministrator: false,
    writesOrDeletes: false,
    opensNetworkPort: false,
    downloadsExecutableCode: false,
    variablesToReplace: [],
    expectedOutput: "An npm version number, for example 11.16.0.",
    rollback: "None; this command only prints the installed version.",
  },
  {
    command: "where.exe node",
    operatingSystem: "Windows 10 or Windows 11",
    shell: "PowerShell or Command Prompt",
    workingDirectory: "Any directory; it does not depend on a project folder.",
    requiresAdministrator: false,
    writesOrDeletes: false,
    opensNetworkPort: false,
    downloadsExecutableCode: false,
    variablesToReplace: [],
    expectedOutput: "One or more paths to node.exe, normally under C:\\Program Files\\nodejs.",
    rollback: "None; this command only locates executable files.",
  },
  {
    command: "where.exe npm",
    operatingSystem: "Windows 10 or Windows 11",
    shell: "PowerShell or Command Prompt",
    workingDirectory: "Any directory; it does not depend on a project folder.",
    requiresAdministrator: false,
    writesOrDeletes: false,
    opensNetworkPort: false,
    downloadsExecutableCode: false,
    variablesToReplace: [],
    expectedOutput: "Paths to npm.cmd and related npm launchers under the Node.js install directory.",
    rollback: "None; this command only locates executable files.",
  },
];
