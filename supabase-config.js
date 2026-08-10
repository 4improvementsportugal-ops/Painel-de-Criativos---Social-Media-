// Configuracao de conexao com o Supabase.
// A chave abaixo e publica por design (protegida pelas regras de RLS do banco,
// que so permitem leitura/escrita nas tabelas do dashboard) - pode ficar no
// codigo do site sem problema, e o mesmo padrao usado em qualquer app Supabase.
const SUPABASE_URL = "https://dhmoedvioqicvjwqmbzm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobW9lZHZpb3FpY3Zqd3FtYnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTIxMjcsImV4cCI6MjA5MzM4ODEyN30.WCULmEGE7g1sWOAht5Dew463GKnTJGM_6ma5Uq0CcZE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
