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
| `/glossary` | 패널 열기 |
| `/glossary close` | 패널 닫기 |
| `/glossary add 용어: 정의` | 용어 추가 (같은 용어는 덮어씀) |
| `/glossary rm 용어` | 용어 삭제 |
| `/glossary keep 용어` | 프로젝트에 보관 |
| `/glossary unkeep 용어` | 이 세션에만 두기 |

패널에서 `●`가 붙은 용어는 프로젝트에 보관된 용어입니다.

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
