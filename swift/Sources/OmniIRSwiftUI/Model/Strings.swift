// Filling the renderer's own words (PLAN-THEMES.md D.2). Port of fillTemplate in
// packages/react/src/catalog/strings.ts, without regular expressions so it runs everywhere.

/// Fill `{name}` placeholders in one pass. What is inserted is never scanned again, and anything else,
/// including unknown placeholders and `%` codes, is kept as written: no formatting function ever sees
/// the app's wording.
public func fillTemplate(_ template: String, _ values: [String: String]) -> String {
  var out = ""
  var at = template.startIndex
  while at < template.endIndex {
    if template[at] == "{", let close = template[at...].firstIndex(of: "}") {
      let name = template[template.index(after: at)..<close]
      if !name.isEmpty, name.allSatisfy({ $0.isASCII && $0.isLetter }), let value = values[String(name)] {
        out += value
        at = template.index(after: close)
        continue
      }
    }
    out.append(template[at])
    at = template.index(after: at)
  }
  return out
}

extension OmniStrings {
  /// A field problem in these words, with its placeholders such as `{max}` filled (SPEC.md section 8).
  public func field(_ problem: FieldProblem) -> String {
    let template: String =
      switch problem.message {
      case "chooseOption": chooseOption
      case "turnOn": turnOn
      case "invalidEmail": invalidEmail
      case "invalidNumber": invalidNumber
      case "invalidPhone": invalidPhone
      case "invalidUrl": invalidUrl
      case "tooShort": tooShort
      case "tooLong": tooLong
      case "dateTooEarly": dateTooEarly
      case "dateTooLate": dateTooLate
      default: required
      }
    return fillTemplate(template, problem.values)
  }
}
