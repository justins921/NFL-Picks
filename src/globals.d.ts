// TypeScript 6 wants a declaration for side-effect imports of non-code files,
// and Next 15.5 only ships one for CSS modules.
declare module "*.css";
