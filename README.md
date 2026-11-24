# glossary

Claude Code용 mod입니다. 대화에서 정의한 용어를 용어집 패널에 모아 두고, 필요할 때 열거나 항상 열어 둘 수 있습니다.

- 대화 중 용어가 정의되면 Claude가 `define` 도구로 용어집에 추가합니다.
- 용어마다 보관 범위가 있습니다. **session**은 이 대화에서만, **project**는 프로젝트 폴더별로 세션을 넘어 유지됩니다.
- 프로젝트에 보관한 용어는 다음 세션에서 Claude가 `list` 도구로 다시 읽을 수 있습니다.

## 설치

터미널 세션의 프롬프트에서:

```
/plugin install glossary --marketplace presentY1897/claude-glossary
```

셸에서:

```
claude plugin install glossary --marketplace presentY1897/claude-glossary
```

마켓플레이스를 추가할지 물으면 `y`, 이어서 범위를 고릅니다.

## 사용

| 명령 | 동작 |
| --- | --- |
| `/glossary` | 패널을 열고 포커스 주기 |
| `/glossary close` | 패널 닫기 |
| `/glossary add 용어: 정의` | 용어 추가 (같은 용어는 덮어씀) |
| `/glossary rm 용어` | 용어 삭제 |
| `/glossary chapter 용어: 챕터` | 챕터 지정 (챕터를 비우면 미분류) |
| `/glossary keep 용어` | 프로젝트에 보관 |
| `/glossary unkeep 용어` | 이 세션에만 두기 |

## 패널

용어가 많아져도 한 화면에서 찾을 수 있게 되어 있습니다.

- **챕터 탭**: 챕터가 하나라도 있으면 맨 위에 `전체`, 챕터별, `미분류` 탭이 생깁니다. 탭을 누르면 그 챕터의 용어만 보입니다.
- **검색**: 검색 칸에 글자를 치면 용어와 정의에서 일치하는 것만 남습니다.
- **접힌 목록**: 용어 하나가 한 줄입니다. 용어를 누르면 정의 전체와 챕터, 보관 범위가 펼쳐집니다.
- **페이지**: 한 화면을 넘으면 아래에 `◀ 1 / 3 ▶`이 생깁니다. 패널에 포커스가 있을 때 `p`, `n` 키로도 넘깁니다.

터미널에서는 `ctrl+x tab`이나 클릭으로 패널에 포커스를 준 뒤 Tab과 Enter로 조작합니다. `●`가 붙은 용어는 프로젝트에 보관된 용어입니다.

## 설정

`/config`에서 바꿉니다.

| 항목 | 기본값 | 설명 |
| --- | --- | --- |
| 시작할 때 열기 (`openOnStart`) | 꺼짐 | 세션을 시작할 때 패널을 자동으로 엽니다. 터미널에서는 폭이 144열 이상일 때 자리 잡습니다. |
| 기본 보관 범위 (`defaultScope`) | `session` | 범위를 정하지 않고 추가한 용어를 어디에 둘지 정합니다. |

## 개발

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
