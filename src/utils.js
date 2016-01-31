export const NoSubFunctionsVisitor = {
  Function(path) {
    path.skip();
  }
}
