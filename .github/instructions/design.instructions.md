---
applyTo: "web/**"
---

# Diretrizes de design

- **Hierarquia:** organize cada tela em torno da tarefa principal. Use títulos descritivos, agrupamento visual e peso tipográfico consistente para deixar clara a ordem de leitura e a ação prioritária.
- **Espaçamento:** siga uma escala consistente de espaçamento e reutilize tokens existentes. Prefira ajustar o layout com essa escala a introduzir valores isolados; mantenha agrupados os elementos relacionados e separe visualmente seções distintas.
- **Estados vazios e de erro:** projete estados vazios, de carregamento e de erro explicitamente. Explique o que aconteceu ou por que não há conteúdo e, quando possível, ofereça um próximo passo claro. Não dependa apenas de cor ou ícone para comunicar erros.
- **Dark mode:** suporte o tema escuro usando tokens semânticos de cor para superfícies, texto, bordas e estados. Verifique contraste e legibilidade nos dois temas, sem inverter cores de forma indiscriminada.
- **Acessibilidade:** use HTML semântico, associe rótulos aos controles e garanta operação por teclado, foco visível e ordem de foco previsível. Forneça nomes acessíveis e instruções para controles; respeite `prefers-reduced-motion` e mantenha contraste suficiente.
