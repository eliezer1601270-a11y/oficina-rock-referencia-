import {
  ClubInfo,
  BoardRoleConfig,
  User,
  RideEvent,
  ForumPost,
  SOSAlert,
  MemberMonthlyFee,
  ClubExpense,
  MemberTabDebt,
  BoardChatMessage,
  Supporter,
  ClubDocument,
  ClubGovernanceDoc,
  DEFAULT_CREST_URL,
  DEFAULT_FEDERATION_LOGO_URL,
  DEFAULT_EXPENSE_TABS,
  DEFAULT_DOCUMENT_CATEGORIES,
} from '../types';

export const INITIAL_CLUB_INFO: ClubInfo = {
  name: 'Oficina do Rock Motoclube',
  foundationYear: 2008,
  city: 'Ibiúna - SP',
  address: 'Rua Fortunato Antônio de Camargo, 215 - Ibiúna, SP',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Rua+Fortunato+Ant%C3%B4nio+de+Camargo+215+Ibiuna+SP',
  contactEmail: 'eliezerrmartins@gmail.com',
  contactPhone: '(15) 99812-4520',
  instagram: 'https://instagram.com/oficinadorock_mc',
  facebook: 'https://facebook.com/oficinadorockmotoclube',
  youtube: 'https://youtube.com/@oficinadorockmc',
  historyText: `Fundado em 2008 na hospitaleira estância turística de Ibiúna, interior do estado de São Paulo, o Oficina do Rock Motoclube nasceu da união de apaixonados pelo bom e velho Rock'n Roll e pela liberdade sobre duas rodas.

O que começou como encontros de amigos em torno de guitarras e motores roncando transformou-se em uma irmandade sólida, forjada no asfalto, no respeito mútuo e na camaradagem da estrada. Nosso brasão ostenta com orgulho a guitarra alada sobre a roda em chamas — o casamento sagrado entre os acordes pesados e a rota infinita.

Ao longo de mais de uma década e meia de história, rodamos milhares de quilômetros pelas rodovias de São Paulo, Minas Gerais, Rio de Janeiro e além. Nossa sede na Rua Fortunato Antônio de Camargo, 215, é nosso templo sagrado: local de confraternização, música ao vivo, histórias de estrada e apoio incondicional a todos os irmãos e simpatizantes do motociclismo autêntico.`,
  rulesText: `1. Respeito irrestrito à hierarquia, à disciplina da estrada e aos irmãos de colete.
2. Na estrada ninguém fica para trás: o comboio roda no ritmo do companheiro mais seguro.
3. Porte do brasão com honra, dignidade e respeito à comunidade.
4. Manter a pontualidade com as obrigações estatutárias e mensalidades do motoclube.
5. Tolerância zero para condutas imprudentes ou desrespeitosas sob o colete.`,
  pixCnpj: '33.328.135/0001-30',
  monthlyFeeAmount: 60.0,
  financialDirectorAuthorized: true,
  leftCrestUrl: DEFAULT_CREST_URL,
  rightCrestUrl: DEFAULT_CREST_URL,
  isHeadquartersOpen: false,
  headquartersOpenText: 'Consulte nossos horários de funcionamento e encontros semanais na sede oficial.',
  headquartersOpenPhotos: [],
  accessRequestMessage: 'Utilize exclusivamente sua Conta Google para solicitar acesso ou entrar no portal dos integrantes. Após o envio do cadastro, a Mesa Diretora analisará e aprovará sua entrada na irmandade.',
  supportersButtonTitle: 'SUPPORT XV',
  supportersButtonSubtitle: 'Pessoas Físicas & Empresas Parceiras',
  supportersButtonDescription: 'Conheça quem caminha lado a lado com o Oficina do Rock MC no SUPPORT XV, fortalecendo nossa sede, eventos beneficentes e a cultura das duas rodas.',
  supportersButtonCta: 'Conhecer SUPPORT XV',
  supportersHistoryText: 'Desde 2008, a caminhada do Oficina do Rock Motoclube em Ibiúna e nas estradas do Brasil conta com a parceria leal de amigos, profissionais autônomos e empresas locais que acreditam na irmandade, no rock’n roll e nas ações sociais do clube. Este espaço SUPPORT XV eterniza nossa gratidão a cada parceiro.',
  supportersCoverUrl: '',
  eventsButtonLabel: 'Próximos Passeios',
  expenseTabs: DEFAULT_EXPENSE_TABS,
  documentCategories: DEFAULT_DOCUMENT_CATEGORIES,
  documentCustomFieldLabels: [],
  federationBadgeLabel: '',
  federationTitle: 'Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)',
  federationDescription:
    'O Oficina do Rock Motoclube é oficialmente filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP), reafirmando o compromisso com a irmandade motociclística, a segurança na estrada e a representatividade do motociclismo paulista.',
  federationLogoUrl: DEFAULT_FEDERATION_LOGO_URL,
  federationWebsite: '',
};

export const INITIAL_BOARD_ROLES: BoardRoleConfig[] = [
  {
    id: 'role-pres',
    title: 'Presidente',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 0,
  },
  {
    id: 'role-vpres',
    title: 'Vice-Presidente',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 1,
  },
  {
    id: 'role-general',
    title: 'Diretor Geral',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 2,
  },
  {
    id: 'role-finance',
    title: 'Diretor Financeiro',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 3,
  },
  {
    id: 'role-disc-1',
    title: 'Diretor de Disciplina 1',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 4,
  },
  {
    id: 'role-disc-2',
    title: 'Diretor de Disciplina 2',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 5,
  },
  {
    id: 'role-disc-3',
    title: 'Diretor de Disciplina 3',
    holderName: 'Cargo vago',
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
    isCustom: false,
    order: 6,
  },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'Eliezer R. Martins',
    nickname: 'Eliezer',
    email: 'eliezerrmartins@gmail.com',
    phone: '(15) 99812-4520',
    role: 'admin',
    status: 'active',
    sosApproved: true,
    motorcycle: 'Harley-Davidson Fat Boy 114',
    bloodType: 'O+',
    emergencyContact: '(15) 99812-4521 (Esposa)',
    joinedYear: 2008,
    joinedDate: '2008-05-10',
    birthDate: '1980-03-18',
    avatarUrl: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=400&q=80',
  },
];

export const INITIAL_EVENTS: RideEvent[] = [];

export const INITIAL_FORUM_POSTS: ForumPost[] = [];

export const INITIAL_SOS_ALERTS: SOSAlert[] = [];

export const INITIAL_FEES: MemberMonthlyFee[] = [];

export const INITIAL_BOARD_CHAT: BoardChatMessage[] = [];

export const INITIAL_EXPENSES: ClubExpense[] = [];

export const INITIAL_TABS: MemberTabDebt[] = [];

export const INITIAL_SUPPORTERS: Supporter[] = [];

export const INITIAL_DOCUMENTS: ClubDocument[] = [];

export const INITIAL_GOVERNANCE_DOCS: ClubGovernanceDoc[] = [
  {
    id: 'estatuto',
    kind: 'estatuto',
    title: 'ESTATUTO SOCIAL DA ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE',
    versionLabel: 'Aprovado em Assembleia Geral de 03/12/2023 · Ibiúna - SP',
    preamble:
      '(Devidamente aprovado através de Assembleia Geral realizada em 03 dezembro de 2023, da qual faz parte integrante)',
    updatedAt: '2023-12-03T10:00:00Z',
    updatedByName: 'Assembleia Geral',
    sections: [
      {
        id: 'est-clausula-1',
        heading: 'CLÁUSULA PRIMEIRA: DA DENOMINAÇÃO, DAS FINALIDADES E DA SEDE',
        content: `Pelo presente estatuto social, fica criada uma associação, que girará sob a denominação de ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, que não terá prazo de duração, não terá fins econômicos e terá a finalidade de buscar a fraternidade entre motociclistas em geral, promover viagens, reuniões e eventos ligados ao motociclismo, no Brasil e no exterior, empreender atividades e eventos educativos e culturais, destinados a filantropia e de ajuda a pessoas carentes e outras finalidades afins.

Parágrafo Primeiro:
A associação terá sua sede na cidade de Ibiúna, São Paulo - SP, Rua Fortunatinho Antônio de Camargo, 215, Centro - CEP 18.150-000 e poderá abrir filiais em outros Municípios e Estados da Federação, mediante aprovação em Assembleia Geral.

Parágrafo Segundo:
A associação terá como fonte de recursos a contribuição associativa mensal dos associados, em valor a ser estabelecido pela Diretoria, assim como por doações efetuadas por pessoas físicas ou jurídicas.`,
      },
      {
        id: 'est-clausula-2',
        heading: 'CLÁUSULA SEGUNDA: DOS ÓRGÃOS DELIBERATIVOS',
        content: `São órgãos deliberativos da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE:
- A Assembleia Geral;
- O Conselho Fiscal e Disciplinar;
- A Diretoria;

Parágrafo Único:
Não haverá remuneração para o exercício de quaisquer cargos dos órgãos deliberativos da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, nem será permitido a qualquer membro da Diretoria ou do Conselho Fiscal e Disciplinar locupletar-se financeiramente, por qualquer modo ou por qualquer atividade desenvolvida pela Associação, assim como é vedado a eles, utilizarem-se de seus respectivos cargos para angariar clientes, para si ou para outrem.`,
      },
      {
        id: 'est-clausula-3',
        heading: 'CLÁUSULA TERCEIRA: DO CONSELHO FISCAL E DISCIPLINAR E DE SUA COMPETÊNCIA',
        content: `O Conselho Fiscal e Disciplinar é constituído por 03 (três) associados contribuintes, de livre escolha da Diretoria, desde que preenchidos os requisitos necessários inerentes ao cargo, cujo mandato será de 02 (dois) anos.

Parágrafo Primeiro:
Caberá ao Conselho Fiscal e Disciplinar, fiscalizar as contas da associação e aprová-las anualmente, bem como julgar as infrações disciplinares dos Associados, dos membros da Diretoria e de seus próprios membros, cabendo, ainda, a ele, obedecidas as regras do presente Estatuto, destituir membros da Diretoria ou do próprio conselho, observando sempre o procedimento para a apuração de falta, prescrito neste Estatuto social, convocando, se necessário, a instalação de uma Assembleia Geral Extraordinária para tal fim.

Parágrafo Segundo:
No caso de infração cometida por membro do Conselho Fiscal e Disciplinar, este deverá, para o julgamento, ser substituído pelo Presidente ou Vice-Presidente, conforme o caso e de acordo com eventuais impedimentos.`,
      },
      {
        id: 'est-clausula-4',
        heading: 'CLÁUSULA QUARTA: DA DIRETORIA E DE SUA COMPETÊNCIA',
        content: `A Diretoria da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, será composta por 04 (quatro) Diretores, que se designarão Presidente, Vice-Presidente, os quais eleitos pela Assembleia Geral, e Diretor Geral e Tesoureiro, de livre escolha do Diretor Presidente, desde que preenchidos os requisitos necessários inerentes ao cargo, cujo mandato será de 02 (dois) anos.

Para se candidatar à eleição da Diretoria da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, pela Assembleia Geral, o Associado deverá preencher cumulativamente os seguintes requisitos:
A. ter, no mínimo, 02 (dois) anos de associação ininterrupta;
B. ser maior de 18 (dezoito) anos;
C. encontrar-se adimplente com as obrigações financeiras e estar em pleno gozo de seus direitos associativos, o que deverá ser atestado pelo Diretor Tesoureiro;
D. não ter sofrido nenhuma penalidade de natureza administrativa grave pelo Conselho Fiscal e Disciplinar, nos últimos 02 (dois) anos;

Parágrafo Primeiro:
Caberá ao Presidente representar a "ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE" ativamente e passivamente, em juízo e fora dele; presidir as Assembleias Gerais; propor como associado Benemérito ou Honorário, pessoa que, em observância ao Estatuto Social, julgar merecedora do título.

Parágrafo Segundo:
Caberá ao Vice-Presidente substituir o Presidente em seus impedimentos ou ausências, inclusive ativa e passivamente, em juízo ou fora dele, coordenar e fiscalizar as atividades das filiais da associação.

Parágrafo Terceiro:
Nos contratos, cheques e quaisquer documentos que impliquem a assunção de obrigações ou compromissos financeiros, será obrigatória apenas, para validade do ato, a subscrição do Diretor Tesoureiro, sendo permitido, em caso de impedimento temporário, a outorga de poderes específicos por instrumento particular de procuração.

Parágrafo Quarto:
O Presidente e o Diretor Geral, de comum acordo e com anuência do Conselho Fiscal e Disciplinar, poderão nomear até 03 (três) outros diretores, devidamente associados, para auxiliar na gestão, sem que qualquer responsabilidade de administração ou de gestão seja transferida, ficando, entretanto, assegurado ao Presidente, a qualquer tempo e a seu exclusivo critério, destituí-los, independente de quaisquer formalidades.

Parágrafo Quinto:
Compete ao Diretor Tesoureiro manter atualizado os livros de registro, documentos e balancetes e apresentar à Assembleia Geral, parecer anual, sobre a situação financeira do Motoclube. Executar a contabilidade financeira, controlar a arrecadação das receitas do Motoclube. Prestar contas à diretoria e à Assembleia Geral sempre que forem solicitadas.

Parágrafo Sexto:
Compete ao Diretor Geral dar suporte a todas as diretorias, monitorar as demais diretorias no cumprimento de suas tarefas e responsabilidades, reportar ao Presidente as ocorrências e o desempenho das atividades das demais diretorias, apurar e encaminhar ao Presidente as denúncias que forem feitas sobre o comportamento de membros do Motoclube.`,
      },
      {
        id: 'est-clausula-5',
        heading: 'CLÁUSULA QUINTA: DAS ASSEMBLEIAS',
        content: `A Assembleia Geral será constituída por todos os Associados que estejam em gozo de seus direitos sociais e a ela caberá, com exclusividade:
A. A cada 02 (dois) anos, eleger os membros da Diretoria, especificamente Presidente e Vice-Presidente, mediante convocação prévia feita pelo Diretor Presidente ou qualquer membro do Conselho Fiscal e Disciplinar da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE;
B. Decidir sobre a dissolução da associação, observando o disposto neste Estatuto, bem como a destinação de seu patrimônio;
C. Proceder a alteração do presente Estatuto, aprovando ou vetando, total ou parcialmente, quaisquer alterações que lhes forem propostas pela Diretoria;
D. Aprovar anualmente as contas de gestão, após aprovação prévia do Conselho Fiscal e Disciplinar da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE;
E. Destituir os Diretores e membros do Conselho Fiscal e Disciplinar, observadas as formalidades do presente Estatuto;

PARÁGRAFO PRIMEIRO — DA INSTALAÇÃO
As Assembleias Gerais serão instaladas pelo Presidente, quando presentes pelo menos metade mais 1 (um) de seus membros, em primeira convocação ou com qualquer número em segunda votação;
Nas Assembleias Gerais em que forem julgadas as contas de gestão ou tiver interesse direto o Presidente da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, para decisão quanto à aprovação desses itens, a Assembleia Geral deverá ser presidida por associado contribuinte por ela indicado, o qual não perderá o direito de voto;
Haverá uma tolerância de 01 (uma) hora entre a primeira e a segunda convocação, sendo que a Assembleia será instalada em segunda convocação com qualquer número de membros presente;
Seus membros não respondem subsidiariamente pelas ações sociais;

PARÁGRAFO SEGUNDO — DA REALIZAÇÃO DAS ASSEMBLEIAS
As Assembleias Gerais serão realizadas, ordinariamente na primeira quinzena do mês de dezembro de cada ano, para deliberar sobre assuntos de interesse geral e aprovação de contas e na mesma época, a cada dois (02) anos, para eleição do Diretor Presidente e Vice-Presidente;
As Assembleias Gerais serão realizadas extraordinariamente, em qualquer tempo, sempre que julgar necessário o Presidente, o Conselho Fiscal e Disciplinar, ou um quinto (1/5) dos associados contribuintes.

PARÁGRAFO TERCEIRO — DA CONVOCAÇÃO
A convocação das Assembleias Gerais, ou do Órgão Deliberativo será feita pelo Presidente da Associação ou por qualquer membro do Conselho Fiscal e Disciplinar ou ainda por um quinto (1/5) dos associados contribuintes, sempre, por carta edital a ser fixada no mural da sede da associação ou por qualquer meio eficiente de comunicação, com prazo não inferior a dez (10) dias;
Nas reuniões da Assembleia Geral, fica expressamente vedada a discussão e a deliberação sobre assuntos estranhos à convocação.
A Assembleia Geral será sempre presidida pelo Presidente da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE ou por seu substituto legal, o qual poderá intervir nos debates, cabendo a ele nos casos de empate, o voto Minerva.

PARÁGRAFO QUARTO — DO QUÓRUM
Em primeira (1ª) convocação, o quórum mínimo para funcionamento da Assembleia Geral, será de maioria simples de seus membros;
Em segunda (2ª) convocação, sempre com uma hora depois da primeira convocação, com qualquer número de membros;
Em quaisquer das situações acima, para aprovação de matérias, o quórum será de maioria simples dos presentes;
Para as deliberações relativas à destituição de administradores e a alteração do Estatuto Social da entidade, serão necessários dois terços (2/3) dos associados presentes à Assembleia Geral, que será convocada especialmente para este fim.`,
      },
      {
        id: 'est-clausula-6',
        heading: 'CLÁUSULA SEXTA: DOS ASSOCIADOS',
        content: `Os associados da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, são divididos nas seguintes categorias:
1) HONORÁRIOS
2) BENEMÉRITOS
3) CONTRIBUINTES

PARÁGRAFO PRIMEIRO
Serão considerados associados Honorários, as pessoas físicas ou jurídicas, a quem esse título for conferido, em razão de seus relevantes e notórios serviços prestados à comunidade, após aprovação em Assembleia Geral Extraordinária.

PARÁGRAFO SEGUNDO
Serão considerados associados Beneméritos, as pessoas físicas ou jurídicas, a quem este título for conferido, em homenagem especial e em atenção a relevantes serviços prestados à ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE ou à classe dos motociclistas, após aprovação em Assembleia Geral Extraordinária.

PARÁGRAFO TERCEIRO
Os associados Beneméritos e Honorários terão os mesmos direitos e deveres dos associados contribuintes, à exceção do direito de voto, ser votado e o dever de contribuir pecuniariamente com a associação.

PARÁGRAFO QUARTO
Serão associados Contribuintes, aqueles que vierem a ter sua admissão aprovada ao quadro associativo pela diretoria e pelo conselho fiscal e Disciplinar.

PARÁGRAFO QUINTO
O número de Associados Contribuintes terá um limite estipulado, pela Diretoria e pelo Conselho Fiscal e disciplinar.`,
      },
      {
        id: 'est-clausula-7',
        heading: 'CLÁUSULA SÉTIMA: DAS CONDIÇÕES PARA ADMISSÃO E DESLIGAMENTO DE ASSOCIADOS',
        content: `A admissão de novo associado, ao quadro social da ASSOCIAÇÃO DE MOTOCICLISTA OFICINA DO ROCK MOTOCLUBE dependerá de proposta escrita, referendada por, pelo menos, dois associados contribuintes a ser encaminhada à Diretoria, que apreciará o pedido, juntamente com o Conselho Fiscal e Disciplinar e decidirá, no prazo de 10 (dez) dias, prorrogável por igual período, deferido ou não o ingresso do novo associado, observadas as regras e condições estabelecidas neste Estatuto.

PARÁGRAFO PRIMEIRO:
Ficam excluídos das regras desta Cláusula os Associados indicados a integrantes Beneméritos e os Honorários, cuja aprovação competirá à Assembleia Geral.

PARÁGRAFO SEGUNDO:
São condições indispensáveis ao ingresso e permanência no quadro associativo, na qualidade de Associado Contribuinte:
A. ter capacidade para exercer direitos e assumir obrigações;
B. Gozar de bom conceito e ter boa conduta;
C. Não ter sido eliminado, de quaisquer outras associações de motociclistas ou organizações congêneres, por ato desabonador;
D. Ser proprietário de motocicleta e esta ser mantida em boas condições de utilização, conservação e segurança ou ser músico que possa participar da banda OFICINA DO ROCK MOTOCLUBE;
E. Assumir o compromisso de obedecer fielmente a este Estatuto, as decisões dos órgãos administrativos da ASSOCIAÇÃO DE MOTOCICLISTA OFICINA DO ROCK MOTOCLUBE e o Regulamento interno a ser oportunamente criado;
F. O presidente poderá propor à assembleia geral a admissão imediata de novo membro se este for motociclista reconhecido e não pertence a outro moto clube.

PARÁGRAFO TERCEIRO:
O associado que pretender se desligar da associação deverá formalizar sua intenção de maneira expressa, por carta endereçada ao Presidente da ASSOCIAÇÃO DE MOTOCICLISTA OFICINA DO ROCK MOTOCLUBE, com antecedência mínima de 30 (trinta) dias;

PARÁGRAFO QUARTO:
De posse do pedido de desligamento, o Presidente mandará efetuar o levantamento dos débitos eventualmente pendentes e decidirá pelo desligamento do associado, cobrando-se as eventuais pendências.

PARÁGRAFO QUINTO:
O associado, que tenha aprovado, pessoalmente, em Assembleia Geral, a assunção de quaisquer obrigações, responderá por elas, proporcionalmente e juntamente com os demais membros aprovadores dos gastos, até seu integral cumprimento, mesmo que tenha sido desligado da associação;`,
      },
      {
        id: 'est-clausula-8',
        heading: 'CLÁUSULA OITAVA: DA RESPONSABILIDADE E DOS DEVERES DOS ASSOCIADOS',
        content: `Os associados de quaisquer categorias não responderão direta, indiretamente ou subsidiariamente pelas obrigações contraídas pela ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, excetuadas aquelas obrigações cujos valores tenham sido prévia e pessoalmente aprovados pelo associado em Assembleia Geral, que continuará a responder por elas, juntamente com os demais membros aprovadores dos referidos gastos, na respectiva proporção.

São deveres dos associados:
A. Portar-se com inteira disciplina e correção, em trânsito com sua motocicleta ou não, e especialmente, quando estiver utilizando o brasão da ASSOCIAÇÃO DE MOTOCICLISTA OFICINA DO ROCK MOTOCLUBE;
B. Manter-se em dia com suas contribuições pecuniárias mensais, que a Diretoria vier a determinar, com a finalidade de despesas administrativas da associação;
C. Cumprir fielmente as disposições estatutárias, o Regulamento Interno e demais decisões dos órgãos administrativos da ASSOCIAÇÃO DE MOTOCICLISTA OFICINA DO ROCK MOTOCLUBE;
D. Cooperar sempre, direta ou indiretamente, para o engrandecimento da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, seu bom nome e nas realizações de suas finalidades;
E. Acatar as designações dos membros dos órgãos deliberativos da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, quando no exercício de suas atividades;
F. Comprovar sua qualidade de associado e a possibilidade do gozo de seus direitos, por meios de carteira social e do recibo, quando quiser ter ingresso nas dependências da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, para votar nas Assembleias, comparecer às reuniões por ele promovidas ou quando for solicitado por diretor ou pessoa devidamente autorizada, onde quer que se encontre na qualidade de profissional, ou estado civil;
G. Comunicar a diretoria por escrito sobre eventual impossibilidade de exercer cargo ou comissão a que tenha sido designado ou eventual alteração de seu endereço residencial ou profissional, ou estado civil;
H. Tratar com o respeito não só os dirigentes e empregados da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, mas também os demais associados;
I. Preservar a boa imagem do motociclista pertencente à ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, demonstrando respeito pelas leis de trânsito, civilidade, companheirismo e solidariedade, assim como, usar em todos os eventos de motociclistas o brasão da associação;
J. Em hipótese nenhuma participar de corridas ilegais, arruaças, ou quaisquer atividades que venham contrariar os estatutos sociais, regulamentos, bem como a legislação vigente no país;
K. Autorizar expressamente a veiculação de sua imagem, de sua motocicleta e sua em todo e qualquer meio de comunicação pela ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, durante sua permanência como associado e até 12 (doze) meses após seu desligamento;
L. Assumir inteira e total responsabilidade pela conduta do visitante que apresentar durante a vigência desta condição.

PARÁGRAFO ÚNICO:
O não comprometimento do estabelecimento nesta Cláusula, inciso "b" do item 2, pelo associado contribuinte, ou seja, quando houver inadimplência no pagamento das contribuições pecuniárias por período superior a 120 (cento e vinte) dias, acarretará a instauração de um procedimento disciplinar, no qual será o associado inadimplente convocado a apresentar sua defesa no prazo de 10 (dez) dias, o qual será julgado pelos membros do Conselho Fiscal e Disciplinar, em igual prazo.`,
      },
      {
        id: 'est-clausula-9',
        heading: 'CLÁUSULA NONA: DOS DIREITOS DOS ASSOCIADOS',
        content: `São direitos dos associados, desde que pontualmente em dia com suas obrigações perante a ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE:
A. Usufruir as prerrogativas fixadas neste estatuto e demais decisões de seus órgãos administrativos, podendo perante estes fazer valer seus direitos;
B. Usar e gozar dos serviços conveniados que a ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, prestar ou vier a apresentar aos associados;
C. Participar das atividades promovidas pela ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE;
D. Votar e ser votado, respeitadas as restrições constantes no presente estatuto;
E. Integrar comissões que venham ser criadas, desde que pela diretoria indicados;
F. Apresentar pretendentes a associados e visitantes;
G. O uso do Brasão Oficial é exclusivo dos Sócios(as), seu companheiro(a) e filhos(as) menores de idade (até 18 anos).`,
      },
      {
        id: 'est-clausula-10',
        heading: 'CLÁUSULA DÉCIMA: DAS PENALIDADES',
        content: `Os associados, sem distinção, estão sujeitos às seguintes penalidades, conforme o caso:
A. Advertência escrita
B. Suspensão
C. Exclusão

PARÁGRAFO PRIMEIRO:
Será passível da pena de advertência escrita, o Associado que:
A. Infringir quaisquer disposições estatutárias, regulamentares ou ainda qualquer decisão dos órgãos administrativos da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE se outra pena mais grave não estiver prevista neste estatuto;
B. Desacatar ou desrespeitar qualquer associado;
C. Promover conflito, como motociclista, dentro ou fora da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE;

PARÁGRAFO SEGUNDO:
Sem prejuízo das demais disposições estatutárias, será passível da pena de suspensão o associado que:
A. Proceder incorretamente no ambiente social da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE ou fora dele, quando em uso do brasão;
B. Desacatar ou desrespeitar qualquer membro da Diretoria ou do Conselho Fiscal e Disciplinar;
C. Dar publicidade às questões privadas da ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, especialmente, as questões disciplinares a que tiver conhecimento, antes de devidamente julgadas pelo Conselho Fiscal e Disciplinar;
D. Quando inscritos ou designados pela Diretoria, para quaisquer atividades inerentes à ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE, recusar sua participação sem causa justificada;
E. Propuser para Associado por má fé, pessoa indigna;
F. For reincidente, no período de 12 (doze) meses a contar da primeira penalidade de advertência escrita.

PARÁGRAFO TERCEIRO:
Sem prejuízo das demais disposições estatutárias, será passível da pena de exclusão, o Associado que:
A. Tiver prestado de má fé, declaração inverídica, como proponente de novo associado ou quando for o proposto;
B. For reincidente, no período de 12 (doze) meses a contar do final da penalidade de suspensão;
C. Apropriar-se por qualquer meio de dinheiro ou materiais pertencentes à ASSOCIAÇÃO DE MOTOCICLISTAS OFICINA DO ROCK MOTOCLUBE;`,
      },
      {
        id: 'est-disposicoes-finais',
        heading: 'DISPOSIÇÕES FINAIS: DA DISSOLUÇÃO, DO EXERCÍCIO SOCIAL E DISPOSIÇÕES GERAIS',
        content: `DA DISSOLUÇÃO SOCIAL:
Em caso de dissolução social da Associação, liquidado o passivo, os bens remanescentes, serão destinados para outra entidade congênere, com personalidade jurídica comprovada, sede e atividade preponderante nesta cidade e devidamente registrada nos órgãos públicos competentes.

PARÁGRAFO QUARTO — DO EXERCÍCIO SOCIAL:
O exercício social terminará em 31 de dezembro de cada ano, quando serão elaboradas as demonstrações financeiras da entidade, de conformidade com as disposições legais.

PARÁGRAFO QUINTO — DAS DISPOSIÇÕES GERAIS:
A Associação não distribui lucros, bonificações ou vantagens a qualquer título, para dirigentes, associados ou mantenedores, sob nenhuma forma ou pretexto, devendo suas rendas ser aplicadas, exclusivamente, no território nacional.

ASSINATURAS:
Oliveira — Presidente
Ana Carolina Ribeiro Rosa — OAB 477.693/SP — Advogada`,
      },
    ],
  },
  {
    id: 'rdi',
    kind: 'rdi',
    title: 'RDI — Regimento Disciplinar Interno',
    versionLabel: '',
    preamble: '',
    updatedAt: '',
    updatedByName: '',
    sections: [],
  },
];



