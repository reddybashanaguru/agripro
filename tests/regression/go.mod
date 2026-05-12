module github.com/finagra/unity/tests/regression

go 1.24

require (
	github.com/finagra/unity v0.0.0
	github.com/shopspring/decimal v1.4.0
	github.com/stretchr/testify v1.10.0
)

replace github.com/finagra/unity => ../../apps/backend

require (
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/kr/pretty v0.3.0 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	gopkg.in/check.v1 v1.0.0-20201130134442-10cb98267c6c // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
